export function filterByTimeRange(data: any[], startTime: Date, endTime: Date): any[] {
    return data.filter(item => {
        const itemTime = new Date(item.timestamp); // Assuming each item has a timestamp property
        return itemTime >= startTime && itemTime <= endTime;
    });
}