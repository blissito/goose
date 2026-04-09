import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";

interface ScrollableTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  mask?: string;
  focus?: boolean;
  maxDisplayWidth?: number;
}

/**
 * A text input component that handles horizontal scrolling for long inputs.
 * Shows a viewport window around the cursor position.
 */
export default function ScrollableTextInput({
  value,
  onChange,
  onSubmit,
  mask,
  focus = true,
  maxDisplayWidth = 60,
}: ScrollableTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  // Keep cursor at end when value changes externally
  useEffect(() => {
    if (cursorOffset > value.length) {
      setCursorOffset(value.length);
    }
  }, [value, cursorOffset]);

  useInput(
    (input, key) => {
      // Ignore navigation keys that should be handled by parent
      if (
        key.upArrow ||
        key.downArrow ||
        (key.ctrl && input === "c") ||
        key.escape
      ) {
        return;
      }

      if (key.return) {
        onSubmit(value);
        return;
      }

      let nextCursorOffset = cursorOffset;
      let nextValue = value;

      if (key.leftArrow) {
        nextCursorOffset = Math.max(0, cursorOffset - 1);
      } else if (key.rightArrow) {
        nextCursorOffset = Math.min(value.length, cursorOffset + 1);
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          nextValue =
            value.slice(0, cursorOffset - 1) +
            value.slice(cursorOffset, value.length);
          nextCursorOffset = cursorOffset - 1;
        }
      } else if (input) {
        // Handle regular input (including pasted text)
        nextValue =
          value.slice(0, cursorOffset) +
          input +
          value.slice(cursorOffset, value.length);
        nextCursorOffset = cursorOffset + input.length;
      }

      setCursorOffset(nextCursorOffset);

      if (nextValue !== value) {
        onChange(nextValue);
      }
    },
    { isActive: focus }
  );

  // Calculate viewport window
  const displayValue = mask ? mask.repeat(value.length) : value;
  
  let visibleText = displayValue;
  let cursorVisiblePos = cursorOffset;
  
  if (displayValue.length > maxDisplayWidth) {
    // Calculate the viewport start position
    // Try to center the cursor, but adjust if near start or end
    let viewportStart = Math.max(0, cursorOffset - Math.floor(maxDisplayWidth / 2));
    const viewportEnd = viewportStart + maxDisplayWidth;
    
    // If we're near the end, adjust to show the end
    if (viewportEnd > displayValue.length) {
      viewportStart = Math.max(0, displayValue.length - maxDisplayWidth);
    }
    
    visibleText = displayValue.slice(viewportStart, viewportStart + maxDisplayWidth);
    cursorVisiblePos = cursorOffset - viewportStart;
    
    // Add indicators for truncated content
    if (viewportStart > 0) {
      visibleText = "…" + visibleText.slice(1);
    }
    if (viewportStart + maxDisplayWidth < displayValue.length) {
      visibleText = visibleText.slice(0, -1) + "…";
    }
  }

  // Render with cursor
  let renderedText = "";
  if (visibleText.length === 0) {
    renderedText = "▎"; // Just show cursor
  } else {
    for (let i = 0; i < visibleText.length; i++) {
      if (i === cursorVisiblePos) {
        renderedText += `\x1b[7m${visibleText[i]}\x1b[27m`; // Inverse video for cursor
      } else {
        renderedText += visibleText[i];
      }
    }
    // Cursor at end
    if (cursorVisiblePos === visibleText.length) {
      renderedText += "\x1b[7m \x1b[27m";
    }
  }

  return <Text>{renderedText}</Text>;
}
