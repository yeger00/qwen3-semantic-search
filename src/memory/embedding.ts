import {
    AutoTokenizer,
    AutoModel,
    type PreTrainedTokenizer,
    type PreTrainedModel,
    type ProgressCallback,
    Tensor,
    cat,
} from "@huggingface/transformers";


const MODEL_ID = "onnx-community/Qwen3-Embedding-0.6B-ONNX";

interface EmbeddingInstance {
    model: PreTrainedModel;
    tokenizer: PreTrainedTokenizer;
}

let instance: EmbeddingInstance | null = null;
let instancePromise: Promise<EmbeddingInstance> | null = null;


function last_token_pool(last_hidden_states: Tensor, attention_mask: Tensor): Tensor {
    const float32Data = new Float32Array(Array.from(attention_mask.data as BigInt64Array, Number));
    const float_attention_mask = new Tensor('float32', float32Data, attention_mask.dims);

    const [batch_size, seq_len, hidden_size] = last_hidden_states.dims;
    
    const last_token_mask = float_attention_mask.slice([0, batch_size], [seq_len - 1, seq_len]);
    const sum_last_token_mask = last_token_mask.sum().data[0];

    if (sum_last_token_mask === batch_size) {
        return last_hidden_states.slice([0, batch_size], [seq_len - 1, seq_len], [0, hidden_size]).squeeze(1);
    } else {
        const sequence_lengths = float_attention_mask.sum(1).sub(1); 
        const pooled_embeddings = [];
        for (let i = 0; i < batch_size; ++i) {
            const seq_len_i = sequence_lengths.data[i];
            const embedding = last_hidden_states.slice([i, i + 1], [Number(seq_len_i), Number(seq_len_i) + 1], [0, hidden_size]);
            pooled_embeddings.push(embedding);
        }
        return cat(pooled_embeddings, 0).squeeze(1);
    }
}


async function getInstance(progress_callback?: ProgressCallback): Promise<EmbeddingInstance> {
  if (instance) {
    return instance;
  }

  if (!instancePromise) {
      instancePromise = new Promise(async (resolve, reject) => {
          try {
              console.log("Loading embedding model and tokenizer...");

              const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
                progress_callback: (p: any) => {
                    if (progress_callback) {
                        if (p.status === 'progress' && (typeof p.progress !== 'number' || isNaN(p.progress))) {
                            p = { ...p, progress: 0 };
                        }
                        progress_callback(p);
                    }
                }
              });

              tokenizer.padding_side = 'left';

              const model = await AutoModel.from_pretrained(MODEL_ID, {
                dtype: 'q8',
                progress_callback: (p: any) => {
                    if (progress_callback) {
                        if (p.status === 'progress' && (typeof p.progress !== 'number' || isNaN(p.progress))) {
                            p = { ...p, progress: 0 };
                        }
                        progress_callback(p);
                    }
                }
              });

              instance = { model, tokenizer };
              console.log("Embedding model and tokenizer loaded successfully.");
              resolve(instance);
          } catch (error) {
              console.error("Failed to load embedding model:", error);
              instancePromise = null;
              reject(error);
          }
      });
  }

  return instancePromise;
}

export async function generateEmbedding(text: string | string[], options?: {
    normalize?: boolean;
    truncate?: boolean;
}): Promise<number[] | number[][]> {
    const { model, tokenizer } = await getInstance();
    
    if (Array.isArray(text)) {
        const embeddings = [];
        for (const t of text) {
            const embedding = await generateEmbedding(t, options);
            embeddings.push(embedding as number[]);
        }
        return embeddings;
    }

    try {
        if (text.trim() === '') {
            console.warn("Input text is empty. Returning zero vectors.");
            const hiddenSize = (model.config as any).hidden_size || 384; 
            return Array(hiddenSize).fill(0);
        }
        
        const inputs = await tokenizer(text, {
            padding: true,
            truncation: true,
        });

        const output = await model(inputs);

        const pooled = last_token_pool(output.last_hidden_state, inputs.attention_mask);
        
        if ((Array.from(pooled.data) as number[]).some(isNaN)) {
            console.warn("Pooled output contains NaN values. Returning zero vector.");
            const hiddenSize = (options?.truncate !== false) ? 256 : ((model.config as any).hidden_size || 384);
            return Array(hiddenSize).fill(0);
        }
        
        let result = pooled;

        if (options?.truncate !== false) { // truncate embeddings
            const truncate_dim = 256;
            const [batch_size] = result.dims;
            result = result.slice([0, batch_size], [0, truncate_dim]);
        }

        if (options?.normalize !== false) { 
            result = result.normalize(2, -1);
        }

        const resultList = result.tolist();
        
        return resultList[0];
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error;
    }
}

export async function generateQueryEmbedding(text: string, options?: {
    normalize?: boolean;
    truncate?: boolean;
}): Promise<number[]> {
    const instruction = 'Given a web search query, retrieve relevant passages that answer the query';
    const instructedQuery = `Instruct: ${instruction}\nQuery: ${text}`;
    const embedding = await generateEmbedding(instructedQuery, options);
    return embedding as number[];
}

export async function preloadEmbeddingModel(progress_callback?: ProgressCallback) {
    try {
        await getInstance(progress_callback);
    } catch (error) {
        console.error("Failed to preload embedding model:", error);
    }
} 