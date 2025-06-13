import * as fs from 'fs';
import * as iconv from 'iconv-lite';

/**
 * Utility functions for handling text encoding detection and conversion
 */

/**
 * Detects if text contains Cyrillic characters that may be incorrectly encoded
 */
export function detectEncodingCorruption(text: string): boolean {
  // Check for common UTF-8 double-encoding patterns
  const utf8DoubleEncoding = /[â€™â€œâ€�â€¦Ã¡Ã©Ã­Ã³ÃºÃ±Ã¼]|[\u00C0-\u00FF]{2,}/.test(text);
  
  // Check for obvious corruption markers like question marks where Cyrillic should be
  const hasCorruptionMarkers = /\?{2,}/.test(text) || /[�]{2,}/.test(text);
  
  return utf8DoubleEncoding || hasCorruptionMarkers;
}

/**
 * Detects if text contains valid Cyrillic characters
 */
export function hasValidCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Attempts to read a file with proper encoding detection
 * Tries UTF-8 first, then CP1251 if encoding corruption is detected
 */
export async function readFileWithEncodingDetection(filePath: string): Promise<string> {
  try {
    // First attempt: UTF-8
    const utf8Content = await fs.promises.readFile(filePath, 'utf8');
    
    // If no encoding corruption detected, use UTF-8 content
    if (!detectEncodingCorruption(utf8Content)) {
      return utf8Content;
    }
    
    console.log(`File ${filePath}: UTF-8 corruption detected, trying CP1251...`);
    
    // Second attempt: CP1251
    try {
      const binaryContent = await fs.promises.readFile(filePath);
      const cp1251Content = iconv.decode(binaryContent, 'cp1251');
      
      // Validate CP1251 result
      if (hasValidCyrillic(cp1251Content) && !detectEncodingCorruption(cp1251Content)) {
        console.log(`File ${filePath}: Successfully decoded with CP1251`);
        return cp1251Content;
      } else {
        console.warn(`File ${filePath}: CP1251 decoding did not improve content quality`);
      }
    } catch (cp1251Error) {
      console.warn(`File ${filePath}: CP1251 decoding failed:`, cp1251Error);
    }
    
    // Fallback to UTF-8 content even if corrupted
    console.log(`File ${filePath}: Falling back to UTF-8 content despite potential corruption`);
    return utf8Content;
    
  } catch (error) {
    console.error(`Failed to read file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Validates that character names don't contain obvious encoding corruption
 */
export function validateCharacterName(characterName: string | undefined): boolean {
  if (!characterName) return true;
  
  // Check for corruption markers
  if (detectEncodingCorruption(characterName)) {
    console.warn(`Character name "${characterName}" appears to have encoding corruption`);
    return false;
  }
  
  return true;
}

/**
 * Attempts to fix common encoding corruption patterns
 */
export function attemptEncodingFix(text: string): string {
  // This is a basic implementation - could be expanded with more patterns
  let fixed = text;
  
  // Common UTF-8 to CP1251 corruption patterns for Cyrillic
  const patterns = [
    // These are example patterns - you'd need to map specific corruption cases
    { corrupted: /╨╗╤â╤ç╨╜╨╕╨║/g, correct: 'лучник' },
    { corrupted: /╤ç╨╝╨╛╨┤╨╗╤Å╨╖╨░╨┐╨░╨╗╨░/g, correct: 'смодлязапала' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.corrupted.test(fixed)) {
      fixed = fixed.replace(pattern.corrupted, pattern.correct);
      console.log(`Applied encoding fix: "${text}" -> "${fixed}"`);
    }
  }
  
  return fixed;
}