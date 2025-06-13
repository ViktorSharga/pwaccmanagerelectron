import { detectEncodingCorruption, hasValidCyrillic, attemptEncodingFix, validateCharacterName } from '../encoding';

describe('Encoding Utilities', () => {
  describe('detectEncodingCorruption', () => {
    it('should detect UTF-8 double encoding', () => {
      expect(detectEncodingCorruption('╨╗╤â╤ç╨╜╨╕╨║')).toBe(true);
      expect(detectEncodingCorruption('normal text')).toBe(false);
    });

    it('should detect CP1251 corruption', () => {
      expect(detectEncodingCorruption('ëó÷íèê')).toBe(true);
      expect(detectEncodingCorruption('лучник')).toBe(false);
    });

    it('should detect corruption markers', () => {
      expect(detectEncodingCorruption('???')).toBe(true);
      expect(detectEncodingCorruption('���')).toBe(true);
      expect(detectEncodingCorruption('valid?')).toBe(false); // Single ? is ok
    });
  });

  describe('hasValidCyrillic', () => {
    it('should detect valid Cyrillic characters', () => {
      expect(hasValidCyrillic('лучник')).toBe(true);
      expect(hasValidCyrillic('воин')).toBe(true);
      expect(hasValidCyrillic('english text')).toBe(false);
      expect(hasValidCyrillic('ëó÷íèê')).toBe(false);
    });
  });

  describe('attemptEncodingFix', () => {
    it('should fix CP1251 corruption', async () => {
      const result = await attemptEncodingFix('ëó÷íèê');
      expect(result).toBe('лучник');
    });

    it('should return original text if no fix needed', async () => {
      const result = await attemptEncodingFix('лучник');
      expect(result).toBe('лучник');
    });

    it('should handle empty strings', async () => {
      const result = await attemptEncodingFix('');
      expect(result).toBe('');
    });

    it('should handle undefined/null', async () => {
      const result1 = await attemptEncodingFix(null as any);
      expect(result1).toBeNull();
      
      const result2 = await attemptEncodingFix(undefined as any);
      expect(result2).toBeUndefined();
    });
  });

  describe('validateCharacterName', () => {
    it('should validate proper character names', () => {
      expect(validateCharacterName('лучник')).toBe(true);
      expect(validateCharacterName('warrior')).toBe(true);
      expect(validateCharacterName(undefined)).toBe(true);
    });

    it('should detect corrupted character names', () => {
      expect(validateCharacterName('ëó÷íèê')).toBe(false);
      expect(validateCharacterName('╨╗╤â╤ç╨╜╨╕╨║')).toBe(false);
    });
  });
});