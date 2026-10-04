import mongoose from 'mongoose';
import app from './app.js';
import { config } from './config.js';

await mongoose.connect(config.mongoUri);
console.log('[db] connected to MongoDB');
app.listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));
