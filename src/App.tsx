import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { generateEmbedding, preloadEmbeddingModel, generateQueryEmbedding } from './memory/embedding';
import { cosineSimilarity } from './memory/similarity';
import { memoryBanks } from './memory/banks';
import type { MemoryBankName } from './memory/banks';
import { 
  getRecordsByBank, 
  clearRecordsByBank, 
  addRecord,
  saveCustomBank,
  getAllCustomBankNames,
  getCustomBank,
  deleteCustomBank as dbDeleteCustomBank
} from './memory/indexeddb';
import MemoryVisualizer from './components/MemoryVisualizer';

function CustomBankModal({ isOpen, onClose, onSave, existingNames }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (name: string, text: string) => Promise<void>,
  existingNames: string[]
}) {
  const [inputText, setInputText] = useState('');
  const [bankName, setBankName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmedName = bankName.trim();
    if (!trimmedName) {
      setError('Bank name cannot be empty.');
      return;
    }
    if (existingNames.includes(trimmedName.toLowerCase())) {
      setError('This name is already taken. Please choose another.');
      return;
    }
    
    const lines = inputText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
      setError('Bank content cannot be empty.');
      return;
    }
    if (lines.length > 20) {
      setError('You can add a maximum of 20 facts.');
      return;
    }
    
    setIsSaving(true);
    setError('');

    setTimeout(async () => {
      try {
        await onSave(trimmedName, inputText);
        handleClose(); 
      } catch (e) {
        console.error(e);
        setError('Failed to save and embed the bank. Please try again.');
        setIsSaving(false); 
      }
    }, 50);
  };
  
  const handleClose = () => {
    setInputText('');
    setBankName('');
    setError('');
    setIsSaving(false); // Also reset saving state on close
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {isSaving ? (
          <div className="modal-saving-state">
            <div className="spinner"></div>
            <h3>Generating embeddings...</h3>
            <p>One moment please :)</p>
          </div>
        ) : (
          <>
            <h2>Create a Custom Memory Bank</h2>
            <p>Give your bank a unique name and add up to 20 facts, one per line.</p>
            
            <input 
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g., My Fun Facts"
              className="modal-input"
            />

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={"The first computer mouse was made of wood.\nA group of flamingos is called a flamboyance."}
              rows={8}
            />
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button onClick={handleClose} className="button-secondary">Cancel</button>
              <button onClick={handleSave} className="button-primary">Save Bank</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, bankName }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bankName: string | null;
}) {
  if (!isOpen || !bankName) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>You sure?</h2>
        <p>
          Are you sure that you want to permanently delete the "<strong>{bankName}</strong>" memory bank?
        </p>
        <div className="modal-actions">
          <button onClick={onClose} className="button-secondary">Cancel</button>
          <button onClick={onConfirm} className="button-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}

function LoadingBar({ message, stageText, progress, showBar }: { message: string, stageText: string, progress: number, showBar: boolean }) {
  const displayPercentage = Math.round(progress);

  return (
    <div className="loading-indicator">
      <h1>Qwen3 Semantic Search</h1>
      
      <div className="loading-status">
        <div className="loading-text">
          <p className="loading-message">{message}</p>
          {stageText && <p className="loading-stage">{stageText}</p>}
        </div>
        
        <div className={`progress-container ${!showBar ? 'hidden' : ''}`}>
          <div 
            className="progress-bar" 
            style={{ 
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgb(255, 193, 7), rgb(255, 167, 38))'
            }}
          >
            <span className="progress-text">{displayPercentage}%</span>
          </div>
        </div>
      </div>
      
      <div className="loading-tips">
        <p>The model will be cached for faster loading in future sessions.</p>
      </div>
    </div>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ text: string; score: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeBank, setActiveBank] = useState<string>('General');
  const [memoryBankEmbeddings, setMemoryBankEmbeddings] = useState<number[][] | null>(null);
  const [viewMode, setViewMode] = useState<'visualizer' | 'list'>('visualizer');
  const isInitialLoad = useRef(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [bankToDelete, setBankToDelete] = useState<string | null>(null);
  const [newlyAddedBank, setNewlyAddedBank] = useState<string | null>(null);
  const [deletingBank, setDeletingBank] = useState<string | null>(null);

  const [availableBanks, setAvailableBanks] = useState<string[]>(Object.keys(memoryBanks));
  const [customBankData, setCustomBankData] = useState<Record<string, string[]>>({});

  const [isAppLoading, setIsAppLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStageText, setLoadingStageText] = useState('');
  const [showProgressBar, setShowProgressBar] = useState(true);
  
  const currentMemoryBank = (memoryBanks as Record<string, string[]>)[activeBank] || customBankData[activeBank] || [];

  const getRelevance = (score: number) => {
    if (score > 0.49) return 'high-relevance';
    if (score > 0.38) return 'medium-relevance';
    return 'low-relevance';
  };

  // useEffect(() => {
  //   const queryTest = async (queryText: string, bankName: string) => {
  //     if (!queryText || !bankName) {
  //       console.log('Usage: queryTest("your query", "bankName")');
  //       return;
  //     }

  //     console.log(`Querying bank "${bankName}" with: "${queryText}"`);

  //     try {
  //       const bankRecords = await getRecordsByBank(bankName);
  //       if (!bankRecords || bankRecords.length === 0) {
  //         console.error(`Bank "${bankName}" not found or is empty. Please ensure the bank has been loaded at least once in the UI to generate embeddings.`);
  //         return;
  //       }
        
  //       const bankEmbeddings = bankRecords.map(r => r.embedding);
  //       const bankContent = bankRecords.map(r => r.text);

  //       console.log('Generating query embedding...');
  //       const queryEmbedding = await generateQueryEmbedding(queryText, {});

  //       if (Array.isArray(queryEmbedding)) {
  //         console.log('Calculating similarities...');
  //         const results = bankContent.map((text, i) => {
  //           const sim = cosineSimilarity(queryEmbedding, bankEmbeddings[i]);
  //           return { text, score: sim };
  //         });

  //         results.sort((a, b) => b.score - a.score);

  //         console.log('Search results:');
  //         console.table(results);
  //       } else {
  //         throw new Error("Query embedding generation failed");
  //       }
  //     } catch (error) {
  //       console.error('Test query failed:', error);
  //     }
  //   };

  //   (window as any).queryTest = queryTest;

  //   return () => {
  //     delete (window as any).queryTest;
  //   };
  // }, []);

  useEffect(() => {
    let isCancelled = false;

    async function setup() {
      // load model
      setShowProgressBar(true);
      await preloadEmbeddingModel((p: any) => {
        let message = '';
        let stageText = '';
        
        if (p.status === 'initiate') {
          message = `Initializing ${p.file || ''}...`;
          setLoadingProgress(0);
        } else if (p.status === 'download') {
          message = `Downloading ${p.file || ''}...`;
          setLoadingProgress(0);
        } else if (p.status === 'progress') {
          if (p.file && p.file.includes('tokenizer')) {
            message = `Loading tokenizer...`;
            stageText = `${p.file}: ${p.progress.toFixed(1)}%`;
          } else {
            message = `Loading model...`;
            stageText = `${p.file}: ${p.progress.toFixed(1)}%`;
          }
          setLoadingProgress(p.progress || 0);
        }
        setLoadingMessage(message);
        setLoadingStageText(stageText);
      });

      if (isCancelled) return;

      // embed and cache memory banks
      setShowProgressBar(false);
      setLoadingMessage('Generating embeddings...');
      setLoadingStageText('');
      
      const defaultBankNames = Object.keys(memoryBanks) as MemoryBankName[];
      for (let i = 0; i < defaultBankNames.length; i++) {
        const bankName = defaultBankNames[i];
        if (isCancelled) return;
        
        const bankData = memoryBanks[bankName];
        
        const embeddingProgress = ((i + 1) / defaultBankNames.length) * 100;
        setLoadingProgress(embeddingProgress);
        setLoadingStageText(`Processing: ${bankName}`);

        try {
          const cachedRecords = await getRecordsByBank(bankName);
          if (isCancelled) return;
          const needsGeneration = cachedRecords.length !== bankData.length || !cachedRecords.every((r, i) => r.text === bankData[i]);
          if (needsGeneration) {
            await clearRecordsByBank(bankName); // Clear old records
            const embeddings = await generateEmbedding(bankData, {});
            if (isCancelled) return;
            if (Array.isArray(embeddings) && Array.isArray(embeddings[0])) {
              for (let j = 0; j < bankData.length; j++) {
                if (isCancelled) return;
                await addRecord({ bank: bankName, text: bankData[j], embedding: embeddings[j] as number[] });
              }
            }
          }
        } catch (error) {
          console.error(`Failed to cache memory bank ${bankName}:`, error);
        }
      }

      // load custom banks
      setLoadingStageText('Loading custom banks...');
      const customBankNames = await getAllCustomBankNames();
      if(customBankNames.length > 0) {
        setAvailableBanks([...Object.keys(memoryBanks), ...customBankNames]);
        const customData: Record<string, string[]> = {};
        for(const name of customBankNames) {
          const bank = await getCustomBank(name);
          if(bank) {
            customData[name] = bank.content;
          }
        }
        setCustomBankData(customData);
      }

      if (isCancelled) return;
      setLoadingMessage('Setup complete!');
      setLoadingProgress(100);
      
      await new Promise(resolve => setTimeout(resolve, 300));

      setIsAppLoading(false);
    }

    setup();
    return () => { isCancelled = true; };
  }, []);

  useEffect(() => {
    if (isAppLoading) return;

    let isCancelled = false;
    async function loadBank() {
      setSearchResults([]);
      setViewMode('visualizer');
      
      if (!Object.keys(memoryBanks).includes(activeBank) && !customBankData[activeBank]) {
        const bank = await getCustomBank(activeBank);
        if (bank) {
          setCustomBankData(prev => ({ ...prev, [activeBank]: bank.content }));
        }
      }

      const cachedRecords = await getRecordsByBank(activeBank);
      if (isCancelled) return;
      
      const currentBankContent = (memoryBanks as Record<string, string[]>)[activeBank] || customBankData[activeBank] || [];
      
      if (cachedRecords.length !== currentBankContent.length) {
        await clearRecordsByBank(activeBank);
        const embeddings = await generateEmbedding(currentBankContent, {});
        if (isCancelled) return;
        if (Array.isArray(embeddings) && Array.isArray(embeddings[0])) {
          for (let j = 0; j < currentBankContent.length; j++) {
            if (isCancelled) return;
            await addRecord({ bank: activeBank, text: currentBankContent[j], embedding: embeddings[j] as number[] });
          }
          const newCachedRecords = await getRecordsByBank(activeBank);
          if (isCancelled) return;
          setMemoryBankEmbeddings(newCachedRecords.map(r => r.embedding));
        }
      } else {
        setMemoryBankEmbeddings(cachedRecords.map(r => r.embedding));
      }
    }
    loadBank();
    return () => { isCancelled = true; };
  }, [activeBank, isAppLoading]);

  useEffect(() => {
    if (newlyAddedBank) {
      const timer = setTimeout(() => setNewlyAddedBank(null), 500); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [newlyAddedBank]);

  useEffect(() => {
    if (memoryBankEmbeddings && isInitialLoad.current) {
      isInitialLoad.current = false;
    }
  }, [memoryBankEmbeddings]);

  const handleSearch = useCallback(async () => {
    if (!query) {
      alert('Please enter a query.');
      return;
    }
    if (!memoryBankEmbeddings) {
      alert('Memory bank is not ready yet.');
      return;
    }
    setLoading(true);
    setSearchResults([]);

    try {
      const queryEmbedding = await generateQueryEmbedding(query, {});

      if (Array.isArray(queryEmbedding)) {
        const results = currentMemoryBank.map((text, i) => {
          const sim = cosineSimilarity(queryEmbedding, memoryBankEmbeddings[i]);
          return { text, score: sim };
        });

        results.sort((a, b) => b.score - a.score);
        setSearchResults(results);
      } else {
        throw new Error("Query embedding generation failed");
      }
    } catch (error) {
      console.error(error);
      alert('Failed to perform search.');
    } finally {
      setLoading(false);
    }
  }, [query, memoryBankEmbeddings, activeBank, currentMemoryBank]);

  const handleSaveCustomBank = async (name: string, text: string) => {
    const newBankContent = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (newBankContent.length === 0) return;

    try {
      const embeddings = await generateEmbedding(newBankContent, {});
      await saveCustomBank({ name, content: newBankContent });
      
      if (Array.isArray(embeddings) && Array.isArray(embeddings[0])) {
        for (let j = 0; j < newBankContent.length; j++) {
          await addRecord({ bank: name, text: newBankContent[j], embedding: embeddings[j] as number[] });
        }
      } else {
        throw new Error("Embedding generation failed to produce expected array format.");
      }
      
      setAvailableBanks(prev => [...prev, name]);
      setCustomBankData(prev => ({ ...prev, [name]: newBankContent }));
      setActiveBank(name); 
      setNewlyAddedBank(name); 

    } catch (error) {
      console.error("Failed to save custom bank:", error);
      throw error;
    }
  };

  const requestDeleteCustomBank = (bankName: string) => {
    setBankToDelete(bankName);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!bankToDelete) return;

    try {
      await dbDeleteCustomBank(bankToDelete);
      await clearRecordsByBank(bankToDelete);

      setDeletingBank(bankToDelete);
      setIsConfirmModalOpen(false);

      setTimeout(() => {
        if (activeBank === bankToDelete) {
          setActiveBank('General');
        }
        setAvailableBanks(prev => prev.filter(b => b !== bankToDelete));
        setCustomBankData(prev => {
          const newCustomData = { ...prev };
          delete newCustomData[bankToDelete];
          return newCustomData;
        });

        setBankToDelete(null);
        setDeletingBank(null);
      }, 400);

    } catch (error) {
      console.error("Failed to delete custom bank:", error);
      alert("There was an error deleting the bank.");
      setIsConfirmModalOpen(false);
      setBankToDelete(null);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="main-content">
          {isAppLoading && <LoadingBar message={loadingMessage} stageText={loadingStageText} progress={loadingProgress} showBar={showProgressBar} />}
          
          {memoryBankEmbeddings && viewMode === 'visualizer' && (
            <div key="visualizer" className={`visualizer-wrapper ${isInitialLoad.current ? 'fade-in' : ''}`}>
              <MemoryVisualizer
                memoryItems={currentMemoryBank}
                searchResults={searchResults}
                isLoaded={!!memoryBankEmbeddings}
                embeddings={memoryBankEmbeddings}
                getRelevance={getRelevance}
              />
            </div>
          )}
          
          {memoryBankEmbeddings && viewMode === 'list' && (
            <div key="list" className={`search-results ${isInitialLoad.current ? 'fade-in' : ''}`}>
              <h2>Results</h2>
              {searchResults.length > 0 ? (
                <ul>
                  {searchResults.map((result, index) => {
                    const relevance = getRelevance(result.score);
                    const relevanceLabel = relevance.replace('-relevance', '');
                    const capitalizedLabel = relevanceLabel.charAt(0).toUpperCase() + relevanceLabel.slice(1);
                    return (
                      <li key={index} className={relevance}>
                        <p><strong>Similarity: {result.score.toFixed(4)} ({capitalizedLabel})</strong> - {result.text}</p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="no-results-message">Enter a query to see search results here.</p>
              )}
            </div>
          )}
        </div>

        {!isAppLoading && memoryBankEmbeddings && (
          <footer className={`controls-footer ${isInitialLoad.current ? 'fade-in' : ''}`}>
            <CustomBankModal 
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onSave={handleSaveCustomBank}
              existingNames={availableBanks.map(b => b.toLowerCase())}
            />
            <ConfirmationModal 
              isOpen={isConfirmModalOpen}
              onClose={() => setIsConfirmModalOpen(false)}
              onConfirm={handleConfirmDelete}
              bankName={bankToDelete}
            />
            <h1>Qwen3 Semantic Search</h1>
            <div className="sub-links">
              <a href="https://github.com/callbacked/qwen3-semantic-search" target="_blank" rel="noopener noreferrer" className="github-link">
                <svg
                  viewBox="0 0 16 16"
                  version="1.1"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                  ></path>
                </svg>
                Check it out on GitHub
              </a>
            </div>

            <div className="view-controls">
              <button 
                className={`view-toggle ${viewMode === 'visualizer' ? 'active' : ''}`} 
                onClick={() => setViewMode('visualizer')}
              >
                Graph View
              </button>
              <button 
                className={`view-toggle list-mode-button ${viewMode === 'list' ? 'active' : ''} ${searchResults.length > 0 ? 'visible' : ''}`}
                onClick={() => setViewMode('list')}
                disabled={searchResults.length === 0}
              >
                List View
              </button>
            </div>
            
            <div className="search-container">
              <textarea
                value={query}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Enter a search query..."
                rows={3}
                className="search-input"
              />
              <button 
                onClick={handleSearch} 
                disabled={loading || !memoryBankEmbeddings}
                className="search-button"
                aria-label="Search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 18V4M5 11l7-7 7 7" />
                </svg>
              </button>
            </div>

            <div className="bank-selector">
              {availableBanks.map(name => (
                <button
                  key={name}
                  className={`bank-button ${activeBank === name ? 'active' : ''} ${name === newlyAddedBank ? 'animate-in' : ''} ${name === deletingBank ? 'animate-out' : ''}`}
                  onClick={() => setActiveBank(name)}
                >
                  {name}
                  {!Object.keys(memoryBanks).includes(name) && (
                    <span 
                      className="delete-bank-btn" 
                      onClick={(e) => {
                        e.stopPropagation(); 
                        requestDeleteCustomBank(name);
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
              <button
                className="bank-button add-new"
                onClick={() => setIsModalOpen(true)}
              >
                + Add New
              </button>
            </div>
          </footer>
        )}
      </header>
    </div>
  );
}

export default App;
