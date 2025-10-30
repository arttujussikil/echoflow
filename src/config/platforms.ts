export const platforms = {
    reddit: {
        apiUrl: 'https://www.reddit.com',
        searchEndpoint: '/search.json',
        authRequired: false,
    },
    twitter: {
        apiUrl: 'https://api.twitter.com',
        searchEndpoint: '/2/tweets/search/recent',
        authRequired: true,
  
    },
    forums: {
        apiUrl: 'https://example-forum.com',
        searchEndpoint: '/api/search',
        authRequired: false,
    },
};