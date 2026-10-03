import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ServiceCategory {
  MACHINERY_RENTAL = 'machinery_rental',
  PLOWING = 'plowing',
  SOWING = 'sowing',
  FERTILIZER = 'fertilizer',
  DELIVERY = 'delivery',
  STORAGE = 'storage',
  AGRONOMIST = 'agronomist',
  LABOR = 'labor',
  IRRIGATION = 'irrigation',
  REPAIR = 'repair',
}

@Entity('service_listings')
export class ServiceListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ServiceCategory })
  category: ServiceCategory;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  priceFrom: number;

  @Column({ default: 'KZT' })
  currency: string;

  @Column({ default: true })
  urgentAvailable: boolean;

  @Column({ default: 'on_request' })
  availability: string;

  @Column({ type: 'varchar', nullable: true })
  serviceArea: string | null;

  @Column({ default: 24 })
  responseSlaHours: number;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  country: string;

  @Column()
  region: string;

  @Column()
  district: string;

  @Column()
  locality: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 4.5 })
  rating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  @Column({ default: 0 })
  completedJobs: number;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column()
  providerUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'providerUserId' })
  providerUser: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
