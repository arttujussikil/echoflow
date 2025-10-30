export function validateKeyword(keyword: string): boolean {
    const keywordRegex = /^[a-zA-Z0-9\s]+$/;
    return keywordRegex.test(keyword);
}

export function validateDateRange(startDate: Date, endDate: Date): boolean {
    return startDate <= endDate;
}

export function validateFilters(filters: Record<string, any>): boolean {
    // Add specific filter validation logic here
    return true; // Placeholder for actual validation
}