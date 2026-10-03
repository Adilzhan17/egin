import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './database.config';

dotenv.config();

const AppDataSource = new DataSource(buildDatabaseOptions(process.env));

export default AppDataSource;
