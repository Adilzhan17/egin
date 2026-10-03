import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InfoCenterCategory {
  NEWS = 'news',
  SUBSIDIES = 'subsidies',
  EXPORT = 'export',
  IMPORT = 'import',
  PRICES = 'prices',
}

export enum InfoCenterStatus {
  NEW = 'new',
  IMPORTANT = 'important',
  UPDATE = 'update',
}

@Entity('info_center_items')
export class InfoCenterItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: InfoCenterCategory })
  category: InfoCenterCategory;

  @Column()
  title: string;

  @Column({ length: 280 })
  summary: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: InfoCenterStatus, default: InfoCenterStatus.NEW })
  status: InfoCenterStatus;

  @Column({ default: true })
  isFeatured: boolean;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  actionLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  actionUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'date' })
  publishedAt: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
