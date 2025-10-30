import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';

export const exportRouter = Router();

exportRouter.post('/powerbi', async (req: Request, res: Response) => {
  try {
    const { searchId, format, includeRawData } = req.body;

    if (!searchId) {
      return res.status(400).json({ error: 'searchId is required' });
    }

    logger.info(`Exporting data for Power BI: ${searchId}`, { format });

    const mockExport = {
      searchId,
      format: format || 'json',
      downloadUrl: '/api/export/download/' + searchId,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    res.json(mockExport);
  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

exportRouter.get('/download/:searchId', async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const format = req.query.format || 'json';

    logger.info(`Downloading export: ${searchId}`, { format });

    res.json({ message: 'Download not yet implemented', searchId, format });
  } catch (error) {
    logger.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download' });
  }
});