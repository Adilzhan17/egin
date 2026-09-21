import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFarmPlotDto } from './create-farm-plot.dto';

/** Geometry cannot be replaced through PATCH (it needs PostGIS normalisation). */
export class UpdateFarmPlotDto extends PartialType(OmitType(CreateFarmPlotDto, ['geometry'] as const)) {}
