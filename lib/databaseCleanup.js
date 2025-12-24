// Database connection cleanup utility
// This utility helps prevent memory leaks by ensuring proper connection cleanup

export const safeReleaseClient = (client) => {
  if (client && typeof client.release === 'function') {
    try {
      client.release();
    } catch (releaseError) {
      console.error('Error releasing database client:', releaseError);
    }
  }
};

export const withDatabaseConnection = async (callback) => {
  let client;
  try {
    const { connectToDatabase } = await import('./db.js');
    client = await connectToDatabase();
    return await callback(client);
  } catch (error) {
    console.error('Database operation error:', error);
    throw error;
  } finally {
    safeReleaseClient(client);
  }
};

// Memory usage monitoring
export const logMemoryUsage = () => {
  const used = process.memoryUsage();
  console.log('Memory Usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
    external: `${Math.round(used.external / 1024 / 1024 * 100) / 100} MB`,
    timestamp: new Date().toISOString()
  });
};

// Periodic memory monitoring in production
let memoryMonitorInterval = null;

export const startMemoryMonitoring = () => {
  if (process.env.NODE_ENV === 'production' && !memoryMonitorInterval) {
    memoryMonitorInterval = setInterval(() => {
      logMemoryUsage();
    }, 300000); // Every 5 minutes
  }
};

export const stopMemoryMonitoring = () => {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
};

// Start monitoring in production
startMemoryMonitoring();
