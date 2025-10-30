export function formatData(data: any[]): any[] {
    return data.map(item => ({
        id: item.id,
        title: item.title,
        content: item.content,
        timestamp: item.timestamp,
        source: item.source,
        engagement: {
            likes: item.engagement.likes,
            shares: item.engagement.shares,
            comments: item.engagement.comments,
        },
    }));
}