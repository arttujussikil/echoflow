export function engagementFilter(data: any[], minLikes: number, minComments: number, minShares: number): any[] {
    return data.filter(item => {
        const engagementScore = (item.likes || 0) + (item.comments || 0) + (item.shares || 0);
        return engagementScore >= (minLikes + minComments + minShares);
    });
}