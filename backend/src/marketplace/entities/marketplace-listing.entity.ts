import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
}

export enum ListingVisibilityStatus {
  VISIBLE = 'visible',
  HIDDEN = 'hidden',
}

export enum ListingRecommendationStatus {
  HEALTHY = 'healthy',
  CAUTION = 'caution',
  LOW_INTEREST = 'low_interest',
}

@Entity('marketplace_listings')
export class MarketplaceListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'farmerId' })
  farmer: User;

  @Column()
  farmerId: string;

  @Column()
  cropId: string; // Foreign key conceptually mapped in service or relation

  @Column({ default: 'Все' })
  category: string;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal')
  quantity: number;

  @Column()
  unit: string; // kg, tons

  @Column('decimal')
  price: number;

  @Column({ default: 'KZT' })
  currency: string;

  @Column('date')
  availableFrom: Date;

  @Column()
  location: string;

  @Column({ type: 'varchar', nullable: true })
  imageUrl?: string | null;

  @Column({ default: false })
  deliveryAvailable: boolean;

  @Column({ type: 'varchar', nullable: true })
  deliveryNotes?: string | null;

  @Column({ type: 'integer', nullable: true })
  freshnessDays?: number | null;

  @Column({ type: 'integer', nullable: true })
  storageLifeDays?: number | null;

  @Column({ type: 'text', nullable: true })
  storageConditions?: string | null;

  @Column({ type: 'varchar', nullable: true })
  recommendedRegion?: string | null;

  @Column({ type: 'varchar', default: 'lead_chat' })
  saleModel: string;

  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.ACTIVE })
  status: ListingStatus;

  @Column({
    type: 'enum',
    enum: ListingVisibilityStatus,
    default: ListingVisibilityStatus.VISIBLE,
  })
  visibilityStatus: ListingVisibilityStatus;

  @Column({ type: 'varchar', nullable: true })
  competitionLevel?: string | null;

  @Column({ type: 'decimal', nullable: true })
  competitionScore?: number | null;

  @Column({ nullable: true, type: 'text' })
  visibilityReason?: string | null;

  @Column({
    type: 'enum',
    enum: ListingRecommendationStatus,
    nullable: true,
  })
  recommendationStatus?: ListingRecommendationStatus | null;

  @Column({ nullable: true, type: 'text' })
  recommendationTitle?: string | null;

  @Column({ nullable: true, type: 'text' })
  recommendationMessage?: string | null;

  @Column('simple-json', { nullable: true })
  recommendedActions?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
