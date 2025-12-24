import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function cn2(...inputs) {
  return inputs.filter(Boolean).join(" ")
}

/**
 * Get the fiscal year in format "YYYY-YY" (e.g., "2025-26")
 * Fiscal year runs from July 1 to June 30 (Pakistan fiscal year)
 * @param {Date} date - Optional date to calculate fiscal year for (defaults to today)
 * @returns {string} Fiscal year in format "YYYY-YY"
 */
export function getFiscalYear(date = new Date()) {
  const currentDate = date instanceof Date ? date : new Date(date);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // getMonth() returns 0-11
  
  // Fiscal year starts on July 1 (month 7)
  // If month is July (7) or later, fiscal year is current year/next year
  // If month is before July, fiscal year is previous year/current year
  if (month >= 7) {
    // July 1 - December 31: Fiscal year is YYYY-YY+1
    const nextYear = (year + 1).toString().slice(-2);
    return `${year}-${nextYear}`;
  } else {
    // January 1 - June 30: Fiscal year is YYYY-1-YY
    const prevYear = year - 1;
    const currentYearShort = year.toString().slice(-2);
    return `${prevYear}-${currentYearShort}`;
  }
}

export const role=1