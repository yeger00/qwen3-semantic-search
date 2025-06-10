import { memoryBankGeneral } from './bank_general';
import { memoryBankProgramming } from './bank_programming';
import { memoryBankScience } from './bank_science';

export type MemoryBankName = "General" | "Programming" | "Science";

export const memoryBanks: Record<MemoryBankName, string[]> = {
  General: memoryBankGeneral,
  Programming: memoryBankProgramming,
  Science: memoryBankScience,
}; 