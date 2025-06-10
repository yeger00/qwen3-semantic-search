const DB_NAME = 'Brain'; // had to call it that 
const DB_VERSION = 4;
const EMBEDDINGS_STORE_NAME = 'memories';
const CUSTOM_BANKS_STORE_NAME = 'custom_banks';

export interface MemoryRecord {
  id?: number;
  text: string;
  embedding: number[];
  bank: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

// initializes db
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (!transaction) return;

      let embeddingsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(EMBEDDINGS_STORE_NAME)) {
        embeddingsStore = db.createObjectStore(EMBEDDINGS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      } else {
        embeddingsStore = transaction.objectStore(EMBEDDINGS_STORE_NAME);
      }

      if (embeddingsStore.indexNames.contains('timestamp')) {
        embeddingsStore.deleteIndex('timestamp');
      }

      if (!embeddingsStore.indexNames.contains('bank')) {
        embeddingsStore.createIndex('bank', 'bank', { unique: false });
      }

      if (!db.objectStoreNames.contains(CUSTOM_BANKS_STORE_NAME)) {
        db.createObjectStore(CUSTOM_BANKS_STORE_NAME, { keyPath: 'name' });
      }
    };

    request.onsuccess = (event) => {
      //console.log(`Database '${DB_NAME}' opened successfully.`);
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = () => {
      console.error('Error opening database:', request.error);
      dbPromise = null; 
      reject(`Error opening database: ${request.error}`);
    };
  });

  return dbPromise;
}

// helper to get a transaction and the object store for embeddings
async function getEmbeddingsStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  const transaction = db.transaction(EMBEDDINGS_STORE_NAME, mode);
  return transaction.objectStore(EMBEDDINGS_STORE_NAME);
}

// adds a memory record to the db
export async function addRecord(record: Omit<MemoryRecord, 'id'>): Promise<number> {
  return new Promise(async (resolve, reject) => {
    const store = await getEmbeddingsStore('readwrite');
    const request = store.add(record);

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    request.onerror = () => {
      console.error('Error adding record:', request.error);
      reject(`Error adding record: ${request.error}`);
    };
  });
}

// memory retrieval 
export async function getRecord(id: number): Promise<MemoryRecord | undefined> {
  return new Promise(async (resolve, reject) => {
    const store = await getEmbeddingsStore('readonly');
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result as MemoryRecord | undefined);
    };

    request.onerror = () => {
      console.error('Error getting record:', request.error);
      reject(`Error getting record: ${request.error}`);
    };
  });
}

export async function getAllRecords(): Promise<MemoryRecord[]> {
  return new Promise(async (resolve, reject) => {
    const store = await getEmbeddingsStore('readonly');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as MemoryRecord[]);
    };

    request.onerror = () => {
      console.error('Error getting all records:', request.error);
      reject(`Error getting all records: ${request.error}`);
    };
  });
}

// delete a memory record from the db
export async function deleteRecord(id: number): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(EMBEDDINGS_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(EMBEDDINGS_STORE_NAME);
  const request = store.delete(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      //console.log(`Record with ID ${id} deleted successfully.`);
      resolve();
    };
    request.onerror = (event) => {
      console.error(`Error deleting record with ID ${id}:`, (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
    transaction.oncomplete = () => {};
    transaction.onerror = (event) => {
       console.error(`Transaction error deleting record ID ${id}:`, (event.target as IDBTransaction).error);
      reject((event.target as IDBTransaction).error);
    }
  });
}

export async function clearRecordsByBank(bank: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const store = await getEmbeddingsStore('readwrite');
    const index = store.index('bank');
    const request = index.openCursor(IDBKeyRange.only(bank));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => {
      console.error(`Error clearing records for bank ${bank}:`, request.error);
      reject(`Error clearing records for bank ${bank}: ${request.error}`);
    };
  });
}

// clears all records from the db
export async function clearAllRecords(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const store = await getEmbeddingsStore('readwrite');
      const request = store.clear();

      request.onsuccess = () => {
          resolve();
      };

      request.onerror = () => {
          console.error('Error clearing store:', request.error);
          reject(`Error clearing store: ${request.error}`);
      };
    });
}

export async function getRecordsByBank(bank: string): Promise<MemoryRecord[]> {
    return new Promise(async (resolve, reject) => {
      const store = await getEmbeddingsStore('readonly');
      const index = store.index('bank');
      const request = index.getAll(bank);
  
      request.onsuccess = () => {
        resolve(request.result as MemoryRecord[]);
      };
  
      request.onerror = () => {
        console.error('Error getting records by bank:', request.error);
        reject(`Error getting records by bank: ${request.error}`);
      };
    });
}

// --- Functions for Custom Memory Banks ---

export interface CustomBankRecord {
  name: string;
  content: string[];
}

// helper to get a transaction and the object store for custom banks
async function getCustomBanksStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  const transaction = db.transaction(CUSTOM_BANKS_STORE_NAME, mode);
  return transaction.objectStore(CUSTOM_BANKS_STORE_NAME);
}

// adds or updates a custom bank
export async function saveCustomBank(bank: CustomBankRecord): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const store = await getCustomBanksStore('readwrite');
    const request = store.put(bank); // 'put' will add or update

    request.onsuccess = () => {
      resolve(request.result as string);
    };

    request.onerror = () => {
      console.error('Error saving custom bank:', request.error);
      reject(`Error saving custom bank: ${request.error}`);
    };
  });
}

// retrieves a custom bank by name
export async function getCustomBank(name: string): Promise<CustomBankRecord | undefined> {
  return new Promise(async (resolve, reject) => {
    const store = await getCustomBanksStore('readonly');
    const request = store.get(name);

    request.onsuccess = () => {
      resolve(request.result as CustomBankRecord | undefined);
    };

    request.onerror = () => {
      console.error('Error getting custom bank:', request.error);
      reject(`Error getting custom bank: ${request.error}`);
    };
  });
}

// retrieves all custom bank names
export async function getAllCustomBankNames(): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    const store = await getCustomBanksStore('readonly');
    const request = store.getAllKeys();

    request.onsuccess = () => {
      resolve(request.result as string[]);
    };

    request.onerror = () => {
      console.error('Error getting all custom bank names:', request.error);
      reject(`Error getting all custom bank names: ${request.error}`);
    };
  });
}

// deletes a custom bank by name
export async function deleteCustomBank(name: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const store = await getCustomBanksStore('readwrite');
    const request = store.delete(name);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting custom bank:', request.error);
      reject(`Error deleting custom bank: ${request.error}`);
    };
  });
} 