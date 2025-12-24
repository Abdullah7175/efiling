"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import FontSize from '@tiptap/extension-font-size';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import ImageExtension from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
// Explicitly import list extensions
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Type,
    List,
    ListOrdered,
    Quote,
    Code,
    Table as TableIcon,
    Image,
    Link as LinkIcon,
    Unlink,
    Undo,
    Redo,
    Minus,
    CaseSensitive,
    Search,
    Replace,
    Mic,
    MicOff,
    Highlighter,
    Palette
} from "lucide-react";
import { useEffect, useState, useRef } from 'react';

export default function TipTapEditor({ 
    value = '', 
    onChange, 
    placeholder = 'Start typing your document...',
    className = ''
}) {
    const [isClient, setIsClient] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [speechText, setSpeechText] = useState('');
    const [speechError, setSpeechError] = useState('');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showHighlightColorPicker, setShowHighlightColorPicker] = useState(false);
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [selectedHighlightColor, setSelectedHighlightColor] = useState('#fef3c7');
    const [lastHighlightColor, setLastHighlightColor] = useState('#fef3c7'); // Store last used highlight color
    const recognitionRef = useRef(null);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Close color pickers when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showColorPicker || showHighlightColorPicker) {
                const target = event.target;
                if (!target.closest('.color-picker-container')) {
                    setShowColorPicker(false);
                    setShowHighlightColorPicker(false);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showColorPicker, showHighlightColorPicker]);

    useEffect(() => {
        if (isClient && 'webkitSpeechRecognition' in window) {
            const recognition = new window.webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsListening(true);
                setSpeechError('');
            };

            recognition.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    setSpeechText(prev => prev + ' ' + finalTranscript);
                }
            };

            recognition.onerror = (event) => {
                setSpeechError('Speech recognition error: ' + event.error);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [isClient]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable StarterKit's list handling to avoid conflicts
                bulletList: false,
                orderedList: false,
                listItem: false,
                // Disable Link, CodeBlock, HorizontalRule, and Underline to avoid duplicates
                link: false,
                codeBlock: false,
                horizontalRule: false,
                underline: false,
            }),
            Underline,
            TextAlign.configure({
                types: ['paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
            }),
            Highlight.configure({
                multicolor: true,
            }),
            Color,
            TextStyle,
            FontFamily.configure({
                types: ['textStyle'],
            }),
            FontSize.configure({
                types: ['textStyle'],
            }),
            Placeholder.configure({
                placeholder: placeholder,
            }),
            Table.configure({
                resizable: true,
                handleWidth: 5,
                cellMinWidth: 100,
            }),
            TableRow,
            TableHeader,
            TableCell.configure({
                HTMLAttributes: {
                    class: 'border border-gray-300 px-3 py-2',
                },
            }),
            ImageExtension.configure({
                allowBase64: true,
                inline: true,
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-blue-600 underline cursor-pointer',
                },
            }),
            CodeBlock,
            HorizontalRule,
            // Explicitly configure list extensions
            BulletList.configure({
                HTMLAttributes: {
                    class: 'list-disc pl-6',
                },
            }),
            OrderedList.configure({
                HTMLAttributes: {
                    class: 'list-decimal pl-6',
                },
            }),
            ListItem.configure({
                HTMLAttributes: {
                    class: 'my-1',
                },
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            if (onChange) {
                onChange(editor.getHTML());
            }
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-4 border border-gray-200 rounded-md',
                style: 'font-family: Arial, sans-serif; font-size: 14px;',
            },
            handleKeyDown: (view, event) => {
                // Let TipTap handle list behavior naturally
                // Only handle Tab key for indentation
                if (event.key === 'Tab') {
                    event.preventDefault();
                    const { state } = view;
                    const { selection } = state;
                    const { $from } = selection;
                    
                    if ($from.parent.type.name === 'listItem') {
                        if (event.shiftKey) {
                            // Shift+Tab: Decrease indent
                            editor.chain().focus().liftListItem('listItem').run();
                        } else {
                            // Tab: Increase indent
                            editor.chain().focus().sinkListItem('listItem').run();
                        }
                        return true;
                    }
                }
                
                return false;
            },
        },
        immediatelyRender: false,
    });

    // Update editor content when value prop changes
    useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            editor.commands.setContent(value);
        }
    }, [editor, value]);

    // Don't render anything until we're on the client
    if (!isClient) {
        return (
            <div className={`tiptap-editor ${className}`}>
                <div className="border-b border-gray-200 p-2 bg-gray-50 rounded-t-md">
                    <div className="flex flex-wrap items-center gap-1">
                        <div className="text-sm text-gray-500">Loading editor...</div>
                    </div>
                </div>
                <div className="min-h-[500px] p-4 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-center">
                    <div className="text-gray-400">Editor is loading...</div>
                </div>
            </div>
        );
    }

    if (!editor) {
        return (
            <div className={`tiptap-editor ${className}`}>
                <div className="border-b border-gray-200 p-2 bg-gray-50 rounded-t-md">
                    <div className="flex flex-wrap items-center gap-1">
                        <div className="text-sm text-gray-500">Loading editor...</div>
                    </div>
                </div>
                <div className="min-h-[500px] p-4 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-center">
                    <div className="text-gray-400">Editor is loading...</div>
                </div>
            </div>
        );
    }

    // Speech functions
    const startListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.start();
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };

    const insertSpeechText = () => {
        if (speechText.trim()) {
            editor.chain().focus().insertContent(speechText.trim()).run();
            setSpeechText('');
        }
    };

    const clearSpeechText = () => {
        setSpeechText('');
    };

    // Find and Replace functions
    const findInDocument = () => {
        if (findText.trim()) {
            const content = editor.getHTML();
            const regex = new RegExp(findText, 'gi');
            const matches = content.match(regex);
            if (matches) {
                alert(`Found ${matches.length} matches for "${findText}"`);
            } else {
                alert(`No matches found for "${findText}"`);
            }
        }
    };

    const replaceInDocument = () => {
        if (findText.trim() && replaceText.trim()) {
            const content = editor.getHTML();
            const regex = new RegExp(findText, 'gi');
            const newContent = content.replace(regex, replaceText);
            editor.commands.setContent(newContent);
            setFindText('');
            setReplaceText('');
            setShowFindReplace(false);
        }
    };

    // Word capitalization functions
    const capitalizeWords = () => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to);
        const capitalized = text.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        editor.commands.insertContent(capitalized);
    };

    const toUpperCase = () => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to);
        editor.commands.insertContent(text.toUpperCase());
    };

    const toLowerCase = () => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to);
        editor.commands.insertContent(text.toLowerCase());
    };

    // List functions - Fixed to work properly
    const toggleBulletList = () => {
        console.log('Toggle bullet list clicked');
        if (editor) {
            console.log('Editor state before:', editor.state.selection);
            editor.chain().focus().toggleBulletList().run();
            console.log('Editor state after:', editor.state.selection);
        } else {
            console.log('Editor not available');
        }
    };

    const toggleOrderedList = () => {
        console.log('Toggle ordered list clicked');
        if (editor) {
            console.log('Editor state before:', editor.state.selection);
            editor.chain().focus().toggleOrderedList().run();
            console.log('Editor state after:', editor.state.selection);
        } else {
            console.log('Editor not available');
        }
    };

    // Multilevel list functions
    const indentList = () => {
        editor.chain().focus().sinkListItem('listItem').run();
    };

    const outdentList = () => {
        editor.chain().focus().liftListItem('listItem').run();
    };

    // Font functions
    const setFontFamily = (fontFamily) => {
        editor.chain().focus().setFontFamily(fontFamily).run();
    };

    const setFontSize = (fontSize) => {
        editor.chain().focus().setFontSize(fontSize).run();
    };

    // Color functions
    const setTextColor = (color) => {
        editor.chain().focus().setColor(color).run();
        setSelectedColor(color);
        setShowColorPicker(false);
    };

    const setHighlightColor = (color) => {
        editor.chain().focus().toggleHighlight({ color }).run();
        setSelectedHighlightColor(color);
        setLastHighlightColor(color); // Store the last used highlight color
        setShowHighlightColorPicker(false);
    };

    // Quick highlight function using last color
    const quickHighlight = () => {
        editor.chain().focus().toggleHighlight({ color: lastHighlightColor }).run();
    };

    const addImage = () => {
        // Create a file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageUrl = event.target.result;
                    editor.chain().focus().setImage({ src: imageUrl }).run();
                };
                reader.readAsDataURL(file);
            }
        };
        
        // Trigger file selection
        input.click();
        
        // Clean up
        input.remove();
    };

    const setLink = () => {
        const url = window.prompt('Enter URL:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    const removeLink = () => {
        editor.chain().focus().unsetLink().run();
    };

    const insertTable = () => {
        editor.chain().focus().insertTable({ 
            rows: 3, 
            cols: 3, 
            withHeaderRow: true 
        }).run();
    };

    const addColumnBefore = () => editor.chain().focus().addColumnBefore().run();
    const addColumnAfter = () => editor.chain().focus().addColumnAfter().run();
    const deleteColumn = () => editor.chain().focus().deleteColumn().run();
    const addRowBefore = () => editor.chain().focus().addRowBefore().run();
    const addRowAfter = () => editor.chain().focus().addRowAfter().run();
    const deleteRow = () => editor.chain().focus().deleteRow().run();
    const deleteTable = () => editor.chain().focus().deleteTable().run();

    // Predefined colors - Fixed duplicate issue
    const colors = [
        '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
        '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
        '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
        '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#b4a7d6', '#d5a6bd', '#c9daf8'
    ];

    return (
        <div className={`tiptap-editor ${className}`}>
            {/* Toolbar */}
            <div className="border-b border-gray-200 p-2 bg-gray-50 rounded-t-md">
                <div className="flex flex-wrap items-center gap-1">
                    {/* Text Formatting */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant={editor.isActive('bold') ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            title="Bold (Ctrl+B)"
                        >
                            <Bold className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive('italic') ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            title="Italic (Ctrl+I)"
                        >
                            <Italic className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive('underline') ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            title="Underline (Ctrl+U)"
                        >
                            <UnderlineIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive('strike') ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            title="Strikethrough"
                        >
                            <Type className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Font Controls */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Select onValueChange={setFontFamily}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Font" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Arial">Arial</SelectItem>
                                <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                                <SelectItem value="Courier New">Courier New</SelectItem>
                                <SelectItem value="Georgia">Georgia</SelectItem>
                                <SelectItem value="Verdana">Verdana</SelectItem>
                                <SelectItem value="Helvetica">Helvetica</SelectItem>
                                <SelectItem value="Calibri">Calibri</SelectItem>
                                <SelectItem value="Cambria">Cambria</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select onValueChange={setFontSize}>
                            <SelectTrigger className="w-20">
                                <SelectValue placeholder="Size" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="8px">8px</SelectItem>
                                <SelectItem value="10px">10px</SelectItem>
                                <SelectItem value="12px">12px</SelectItem>
                                <SelectItem value="14px">14px</SelectItem>
                                <SelectItem value="16px">16px</SelectItem>
                                <SelectItem value="18px">18px</SelectItem>
                                <SelectItem value="20px">20px</SelectItem>
                                <SelectItem value="24px">24px</SelectItem>
                                <SelectItem value="28px">28px</SelectItem>
                                <SelectItem value="32px">32px</SelectItem>
                                <SelectItem value="36px">36px</SelectItem>
                                <SelectItem value="48px">48px</SelectItem>
                                <SelectItem value="72px">72px</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Text Color */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2 relative color-picker-container">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowColorPicker(!showColorPicker)}
                            title="Text Color"
                        >
                            <Palette className="w-4 h-4" />
                        </Button>
                        {showColorPicker && (
                            <div className="absolute top-12 left-0 bg-white border border-gray-200 rounded-md p-2 shadow-lg z-50">
                                <div className="grid grid-cols-10 gap-1">
                                    {colors.map((color, index) => (
                                        <button
                                            key={`text-${color}-${index}`}
                                            className="w-6 h-6 border border-gray-300 rounded hover:scale-110 transition-transform"
                                            style={{ backgroundColor: color }}
                                            onClick={() => setTextColor(color)}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Text Alignment */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant={editor.isActive({ textAlign: 'left' }) ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().setTextAlign('left').run()}
                            title="Align Left"
                        >
                            <AlignLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive({ textAlign: 'center' }) ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().setTextAlign('center').run()}
                            title="Align Center"
                        >
                            <AlignCenter className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive({ textAlign: 'right' }) ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().setTextAlign('right').run()}
                            title="Align Right"
                        >
                            <AlignRight className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive({ textAlign: 'justify' }) ? "default" : "outline"}
                            size="sm"
                            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                            title="Justify"
                        >
                            <AlignJustify className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Lists - MS Word Style */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant={editor.isActive('bulletList') ? "default" : "outline"}
                            size="sm"
                            onClick={toggleBulletList}
                            title="Bullet List (•) - Click to toggle bullet list"
                        >
                            <List className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive('orderedList') ? "default" : "outline"}
                            size="sm"
                            onClick={toggleOrderedList}
                            title="Numbered List (1. 2. 3.) - Click to toggle numbered list"
                        >
                            <ListOrdered className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={indentList}
                            title="Increase Indent (Tab) - Create sub-level in list"
                            disabled={!editor.isActive('bulletList') && !editor.isActive('orderedList')}
                        >
                            →
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={outdentList}
                            title="Decrease Indent (Shift+Tab) - Reduce list level"
                            disabled={!editor.isActive('bulletList') && !editor.isActive('orderedList')}
                        >
                            ←
                        </Button>
                    </div>

                    {/* Highlighter */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2 relative color-picker-container">
                        <Button
                            variant={editor.isActive('highlight') ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                if (showHighlightColorPicker) {
                                    setShowHighlightColorPicker(false);
                                } else {
                                    quickHighlight(); // Use last color for quick highlight
                                }
                            }}
                            title="Highlight Text (uses last color)"
                        >
                            <Highlighter className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowHighlightColorPicker(!showHighlightColorPicker)}
                            title="Choose Highlight Color"
                        >
                            🎨
                        </Button>
                        {showHighlightColorPicker && (
                            <div className="absolute top-12 left-0 bg-white border border-gray-200 rounded-md p-2 shadow-lg z-50">
                                <div className="grid grid-cols-10 gap-1">
                                    {colors.map((color, index) => (
                                        <button
                                            key={`highlight-${color}-${index}`}
                                            className="w-6 h-6 border border-gray-300 rounded hover:scale-110 transition-transform"
                                            style={{ backgroundColor: color }}
                                            onClick={() => setHighlightColor(color)}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Text Case */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={capitalizeWords}
                            title="Capitalize Words"
                        >
                            <CaseSensitive className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toUpperCase}
                            title="UPPERCASE"
                        >
                            AA
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toLowerCase}
                            title="lowercase"
                        >
                            aa
                        </Button>
                    </div>

                    {/* Find & Replace */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFindReplace(!showFindReplace)}
                            title="Find & Replace"
                        >
                            <Search className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Speech to Text */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant={isListening ? "default" : "outline"}
                            size="sm"
                            onClick={isListening ? stopListening : startListening}
                            title="Speech to Text"
                        >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Table */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={insertTable}
                            title="Insert Table"
                        >
                            <TableIcon className="w-4 h-4" />
                        </Button>
                        {editor.isActive('table') && (
                            <>
                                <Button size="sm" variant="outline" onClick={addColumnBefore}>+Col</Button>
                                <Button size="sm" variant="outline" onClick={addColumnAfter}>Col+</Button>
                                <Button size="sm" variant="outline" onClick={deleteColumn}>-Col</Button>
                                <Button size="sm" variant="outline" onClick={addRowBefore}>+Row</Button>
                                <Button size="sm" variant="outline" onClick={addRowAfter}>Row+</Button>
                                <Button size="sm" variant="outline" onClick={deleteRow}>-Row</Button>
                                <Button size="sm" variant="outline" onClick={deleteTable}>-Table</Button>
                            </>
                        )}
                    </div>

                    {/* Media & Links */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addImage}
                            title="Insert Image"
                        >
                            <Image className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={editor.isActive('link') ? "default" : "outline"}
                            size="sm"
                            onClick={setLink}
                            title="Insert Link"
                        >
                            <LinkIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={removeLink}
                            title="Remove Link"
                        >
                            <Unlink className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* History */}
                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => editor.chain().focus().undo().run()}
                            disabled={!editor.can().undo()}
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => editor.chain().focus().redo().run()}
                            disabled={!editor.can().redo()}
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Clear Formatting */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                            title="Clear Formatting"
                        >
                            <Type className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Find & Replace Panel */}
                {showFindReplace && (
                    <div className="mt-2 p-2 bg-white border border-gray-200 rounded-md">
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <Input
                                    placeholder="Find text..."
                                    value={findText}
                                    onChange={(e) => setFindText(e.target.value)}
                                />
                            </div>
                            <div className="flex-1">
                                <Input
                                    placeholder="Replace with..."
                                    value={replaceText}
                                    onChange={(e) => setReplaceText(e.target.value)}
                                />
                            </div>
                            <Button size="sm" onClick={findInDocument}>Find</Button>
                            <Button size="sm" onClick={replaceInDocument}>Replace</Button>
                            <Button size="sm" variant="outline" onClick={() => setShowFindReplace(false)}>Close</Button>
                        </div>
                    </div>
                )}

                {/* Speech to Text Panel */}
                {(isListening || speechText) && (
                    <div className="mt-2 p-2 bg-white border border-gray-200 rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                            <Label className="text-sm font-medium">Speech Recognition:</Label>
                            {isListening && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
                        </div>
                        {speechError && (
                            <div className="text-red-500 text-sm mb-2">{speechError}</div>
                        )}
                        {speechText && (
                            <div className="mb-2">
                                <div className="text-sm text-gray-600 mb-1">Recognized Text:</div>
                                <div className="p-2 bg-gray-50 rounded border text-sm">{speechText}</div>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button size="sm" onClick={insertSpeechText} disabled={!speechText.trim()}>
                                Insert Text
                            </Button>
                            <Button size="sm" variant="outline" onClick={clearSpeechText}>
                                Clear
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Editor Content */}
            <EditorContent 
                editor={editor} 
                className="min-h-[500px] prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-4 border border-gray-200 rounded-md [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror]:outline-none [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_li]:my-1 prose-table:border-collapse prose-table:border prose-table:border-gray-300 prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-td:border prose-td:border-gray-300" 
            />
        </div>
    );
}
