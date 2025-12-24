import React from 'react';

export const DatePicker = React.forwardRef(({ value, onChange, className = '', ...props }, ref) => {
  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      ref={ref}
      className={`border rounded px-2 py-1 ${className}`}
      {...props}
    />
  );
});

DatePicker.displayName = 'DatePicker'; 