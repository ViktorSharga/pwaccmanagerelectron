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
  
  // Check for CP1251 characters displayed in wrong encoding (like ëó÷íèê)
  const cp1251Corruption = /[àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]{3,}/.test(text);
  
  return utf8DoubleEncoding || hasCorruptionMarkers || cp1251Corruption;
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
 * Attempts to fix encoding corruption by trying different decoding approaches
 */
export async function attemptEncodingFix(text: string): Promise<string> {
  if (!text) return text;
  
  try {
    const iconv = await import('iconv-lite');
    
    // Method 1: Try treating the corrupted text as CP1251 bytes interpreted as Latin-1
    // This fixes cases like "ëó÷íèê" -> "лучник"
    if (/[àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(text)) {
      try {
        // Convert the text to buffer assuming it's CP1251 bytes displayed as Latin-1
        const buffer = Buffer.from(text, 'latin1');
        const decoded = iconv.decode(buffer, 'cp1251');
        
        // Check if the result contains valid Cyrillic and no corruption markers
        if (hasValidCyrillic(decoded) && !detectEncodingCorruption(decoded)) {
          console.log(`Fixed CP1251 corruption: "${text}" -> "${decoded}"`);
          return decoded;
        }
      } catch (error) {
        console.warn('CP1251 fix attempt failed:', error);
      }
    }
    
    // Method 2: Handle UTF-8 double encoding corruption
    const patterns = [
      { corrupted: /╨╗╤â╤ç╨╜╨╕╨║/g, correct: 'лучник' },
      { corrupted: /╤ç╨╝╨╛╨┤╨╗╤Å╨╖╨░╨┐╨░╨╗╨░/g, correct: 'смодлязапала' },
      // Add more specific patterns as needed
    ];
    
    let fixed = text;
    for (const pattern of patterns) {
      if (pattern.corrupted.test(fixed)) {
        fixed = fixed.replace(pattern.corrupted, pattern.correct);
        console.log(`Applied UTF-8 pattern fix: "${text}" -> "${fixed}"`);
        return fixed;
      }
    }
    
    // Method 3: Try direct iconv conversion if the text looks like mangled UTF-8
    if (/[\u00C0-\u00FF]{2,}/.test(text)) {
      try {
        const buffer = Buffer.from(text, 'utf8');
        const decoded = iconv.decode(buffer, 'cp1251');
        
        if (hasValidCyrillic(decoded)) {
          console.log(`Fixed UTF-8 mangling: "${text}" -> "${decoded}"`);
          return decoded;
        }
      } catch (error) {
        console.warn('UTF-8 fix attempt failed:', error);
      }
    }
    
  } catch (error) {
    console.warn('Encoding fix failed:', error);
  }
  
  return text; // Return original if no fix worked
}