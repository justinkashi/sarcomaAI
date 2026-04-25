import React from 'react';

export function Slider({ min, max, value, onValueChange, className = '' }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value[0]}
      onChange={(e) => onValueChange([parseInt(e.target.value)])}
      className={className}
    />
  );
}
