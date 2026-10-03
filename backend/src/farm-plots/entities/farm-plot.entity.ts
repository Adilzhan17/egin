import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
// import { Crop } from '../../crops/entities/crop.entity'; // Will add later

export enum PlantingStatus {
  PLANNED = 'planned',
  PLANTED = 'planted',
  HARVESTED = 'harvested',
}

@Entity('farm_plots')
export class FarmPlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column()
  title: string;

  @Column()
  region: string;

  @Column()
  district: string;

  @Column({ nullable: true })
  village: string;

  @Column('decimal')
  areaSizeHectares: number;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true
  })
  geometry: any;

  @Column({ nullable: true })
  cropType: string; // Temporarily string, until Crop module is done

  @Column({ nullable: true })
  fillColor?: string;

  @Column()
  seasonYear: number;

  @Column({ type: 'date', nullable: true })
  plantingDate?: Date | null;

  @Column({ type: 'enum', enum: PlantingStatus, default: PlantingStatus.PLANNED })
  plantingStatus: PlantingStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
