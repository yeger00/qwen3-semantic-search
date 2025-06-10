# Qwen3 0.6B Semantic Search Demo

This is a demonstration the power of using semantic search with the Qwen3-Embedding-0.6B model that came out recently. All running locally within your browser via transformers.js.

Users can explore pre-defined "memory banks" of information or create their own, and then use natural language queries to find the most relevant pieces of text based on their semantic meaning, not just keyword matching.


https://github.com/user-attachments/assets/34cf8dfd-7d15-42da-8550-a402c23ca068



## How It Works

1.  **Model Loading**: On first visit, the application downloads the ONNX embedding model and its associated tokenizer from the Hugging Face Hub. These are stored in the browser's cache.
2.  **Embedding Generation**: Each piece of text (a "memory") in a memory bank is passed through Qwen3-Embedding-0.6B to be converted as an embedding
3.  **Semantic Search**: When you type a query, it is also converted into an embedding vector. The application then calculates the [cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) between your query's vector and every other vector in the active memory bank. Memories with a higher similarity score are considered more semantically relevant.
> Note: There is an accompanying reranker model for Qwen3-Embedding-0.6B, but there are no ONNX conversions out there yet as of making this project. So, in its absence I used cosine similarity to rank results. Though I would love to pick this up at a later time for when there are ONNX quants for this model to have more accurate ranking results. It'd be cool to showcase both models working together at once!
4.  **Visualization**: The graph visualizes these relationships. Each node is a memory, and the lines connecting them represent a high cosine similarity score, showing which concepts the model "thinks" are closely related.
Nodes will glow in varying colors to signify how similar the query is to the results that are shown.


## Features

- **100% Browser-Based**: No server or internet connection is required after the initial model download. All data goes nowhere!
- **Interactive Visualization**: A dynamic, interactive graph visualizes the semantic relationships between different memories, with stronger connections between more similar concepts.
- **Real-time Semantic Search**: Enter a query to see search results ranked by similarity. 
- **Custom Memory Banks**: Users can create, save, and delete their own memory banks. All data is persisted in the browser's IndexedDB, ensuring your custom banks are available on future visits.
- **Pre-loaded Examples**: Comes with three default memory banks (General, Programming, Science) to demonstrate the search capabilities across different domains.

> **Note:** The very first time you load the application, it will need to download the model. This may take a moment, but the files will be cached by your browser for faster loading on subsequent visits.


## Getting Started

To run this project locally, follow these steps:


1.  **Clone the repository:**
    ```bash
    git clone https://github.com/callbacked/qwen3-semantic-search
    cd qwen3-semantic-search
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

4.  **Open the application:**
    Navigate to `http://localhost:5173` in your web browser.


