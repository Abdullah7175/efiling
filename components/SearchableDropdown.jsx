"use client"

import { useState, useEffect, useRef } from 'react';
import { ChevronsUpDown, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn2 } from '@/lib/utils';

export function SearchableDropdown({
  options = [],
  value,
  onChange,
  placeholder = "Select an item...",
  className,
  onSearch,
  isLoading = false,
  emptyMessage = "No results found.",
  id,
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const popoverRef = useRef(null);
  const inputRef = useRef(null);

  // Trigger search when dropdown opens if no options are available
  useEffect(() => {
    if (open && onSearch && options.length <= 1 && !isLoading) {
      // If only "none" option exists, trigger initial search
      console.log('[SearchableDropdown] Opening dropdown, triggering initial search');
      onSearch('');
    }
  }, [open, onSearch, options.length, isLoading]);

  useEffect(() => {
    if (!onSearch) return;
    const handle = setTimeout(() => {
      onSearch(searchTerm);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchTerm, onSearch]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const filteredOptions = onSearch
    ? options
    : options.filter((option) =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      );

  const handleSelect = (selectedValue) => {
    console.log('[SearchableDropdown] Selecting:', selectedValue, typeof selectedValue);
    
    if (onChange) {
      onChange(selectedValue);
    }
    
    setOpen(false);
    setSearchTerm("");
  };

  const selectedOption = options.find((option) => String(option.value) === String(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn2("w-full justify-between", className)}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0" 
        ref={popoverRef} 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b px-3">
            <Input
              ref={inputRef}
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm("");
                }}
                className="ml-2 p-1 hover:bg-accent rounded-sm"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => {
                  const optionValueStr = String(option.value);
                  const currentValueStr = value ? String(value) : '';
                  const isSelected = currentValueStr === optionValueStr;
                  
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[SearchableDropdown] Option clicked:', option.value, option.label);
                        handleSelect(option.value);
                      }}
                      onMouseDown={(e) => {
                        // Prevent the popover from closing before onClick fires
                        e.preventDefault();
                      }}
                      className={cn2(
                        "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        isSelected && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Check
                        className={cn2(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 text-left">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
