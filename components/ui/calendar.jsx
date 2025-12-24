"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Calendar({
    value,
    onChange,
    className,
    minDate,
    maxDate,
    disabledDates = [],
}) {
    const [currentMonth, setCurrentMonth] = useState(() => {
        if (value) {
            const date = new Date(value);
            return new Date(date.getFullYear(), date.getMonth(), 1);
        }
        return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    });

    const today = new Date();
    const selectedDate = value ? new Date(value) : null;

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const getDaysInMonth = (date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const isSameDay = (date1, date2) => {
        if (!date1 || !date2) return false;
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    };

    const isToday = (date) => {
        return isSameDay(date, today);
    };

    const isSelected = (date) => {
        return selectedDate && isSameDay(date, selectedDate);
    };

    const isDisabled = (date) => {
        if (minDate && date < new Date(minDate)) return true;
        if (maxDate && date > new Date(maxDate)) return true;
        if (disabledDates.some(d => isSameDay(date, new Date(d)))) return true;
        return false;
    };

    const handleDateClick = (day) => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        if (!isDisabled(date)) {
            onChange?.(date.toISOString().split('T')[0]);
        }
    };

    const previousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
        days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        days.push(day);
    }

    return (
        <div className={cn("w-full", className)}>
            <div className="flex items-center justify-between mb-4">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={previousMonth}
                    className="h-8 w-8"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-lg font-semibold">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h3>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={nextMonth}
                    className="h-8 w-8"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map((day) => (
                    <div
                        key={day}
                        className="text-center text-sm font-medium text-gray-500 py-2"
                    >
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                    if (day === null) {
                        return <div key={index} className="aspect-square" />;
                    }

                    const date = new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth(),
                        day
                    );
                    const disabled = isDisabled(date);
                    const selected = isSelected(date);
                    const todayDate = isToday(date);

                    return (
                        <button
                            key={day}
                            onClick={() => handleDateClick(day)}
                            disabled={disabled}
                            className={cn(
                                "aspect-square rounded-md text-sm font-medium transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                disabled && "opacity-50 cursor-not-allowed",
                                selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                                todayDate && !selected && "border-2 border-primary",
                                !selected && !todayDate && "text-foreground"
                            )}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

