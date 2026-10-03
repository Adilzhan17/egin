import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FarmPlot } from '../../farm-plots/entities/farm-plot.entity';
import { User } from '../../users/entities/user.entity';

export enum FarmActivityType {
  WATERING = 'watering',
  FERTILIZER = 'fertilizer',
  PESTICIDE = 'pesticide',
  PLANTING = 'planting',
  HARVEST = 'harvest',
  INSPECTION = 'inspection',
  EXPENSE = 'expense',
}

@Entity('farm_activities')
export class FarmActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plotId: string;

  @ManyToOne(() => FarmPlot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plotId' })
  plot: FarmPlot;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: FarmActivityType })
  type: FarmActivityType;

  @Column({ type: 'date' })
  activityDate: Date;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', nullable: true })
  photoUrl?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costKzt: number;

  @Column({ type: 'jsonb', nullable: true })
  materials?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
