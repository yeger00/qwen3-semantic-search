import { memoryBankGeneral } from './bank_general';
import { memoryBankProgramming } from './bank_programming';
import { memoryBankScience } from './bank_science';
import { memoryBankOther } from './bank_other';

export type MemoryBankName = "General" | "Programming" | "Science" | "Other";

export const memoryBanks: Record<MemoryBankName, string[]> = {
  General: memoryBankGeneral,
  Programming: memoryBankProgramming,
  Science: memoryBankScience,
  Other: memoryBankOther,
}; 