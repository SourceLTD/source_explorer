import { useState, useCallback, useRef } from 'react';
import { calculateCursorPosition } from '../utils';

export interface AutocompleteSuggestion {
  code?: string;
  id?: string;
  label?: string;
  gloss?: string;
}

export interface UseAutocompleteOptions<T extends AutocompleteSuggestion> {
  onSearch: (query: string) => Promise<T[]>;
  getInsertValue: (item: T) => string;
  minQueryLength?: number;
}

export interface UseAutocompleteReturn<T extends AutocompleteSuggestion> {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  text: string;
  setText: (text: string) => void;
  showMenu: boolean;
  suggestions: T[];
  menuPosition: { top: number; left: number };
  activeIndex: number;
  handleChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insert: (item: T) => void;
  setShowMenu: (show: boolean) => void;
}

export function useAutocomplete<T extends AutocompleteSuggestion>({
  onSearch,
  getInsertValue,
  minQueryLength = 2,
}: UseAutocompleteOptions<T>): UseAutocompleteReturn<T> {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchAndUpdateSuggestions = useCallback(async (query: string) => {
    if (!query || query.trim().length < minQueryLength) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    try {
      const results = await onSearch(query);
      setSuggestions(results);
      setActiveIndex(results.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Autocomplete search failed:', error);
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }, [onSearch, minQueryLength]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.target;
    setText(value);
    
    // Extract the current word being typed
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const currentWord = words[words.length - 1] || '';
    
    if (currentWord.length >= minQueryLength) {
      setShowMenu(true);
      void searchAndUpdateSuggestions(currentWord);
      
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const position = calculateCursorPosition(inputRef.current, selectionStart);
          setMenuPosition(position);
          // Ensure correct metrics after web fonts load (Safari)
          if ((document as unknown as { fonts?: { ready: Promise<void> } }).fonts?.ready) {
            (document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready.then(() => {
              if (inputRef.current && showMenu) {
                const pos2 = calculateCursorPosition(
                  inputRef.current,
                  inputRef.current.selectionStart ?? selectionStart
                );
                setMenuPosition(pos2);
              }
            });
          }
        }
      });
    } else {
      setShowMenu(false);
    }
  }, [minQueryLength, searchAndUpdateSuggestions, showMenu]);

  const insert = useCallback((item: T) => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const beforeLastWord = textBeforeCursor.slice(0, textBeforeCursor.length - (words[words.length - 1]?.length || 0));
    const after = value.slice(selectionEnd);
    
    const insertValue = getInsertValue(item);
    const newValue = `${beforeLastWord}${insertValue}${after}`;
    setText(newValue);
    setShowMenu(false);
    setActiveIndex(-1);
    
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = beforeLastWord.length + insertValue.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, [getInsertValue]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMenu || suggestions.length === 0) return;
    
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const choice = suggestions[idx];
      if (choice) insert(choice);
    } else if (event.key === 'Escape') {
      setShowMenu(false);
      setActiveIndex(-1);
    }
  }, [showMenu, suggestions, activeIndex, insert]);

  return {
    inputRef,
    text,
    setText,
    showMenu,
    suggestions,
    menuPosition,
    activeIndex,
    handleChange,
    handleKeyDown,
    insert,
    setShowMenu,
  };
}

