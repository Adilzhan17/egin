import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FarmPlotsService } from './farm-plots.service';
import { CreateFarmPlotDto } from './dto/create-farm-plot.dto';
import { UpdateFarmPlotDto } from './dto/update-farm-plot.dto';

@ApiTags('FarmPlots')
@Controller('farm-plots')
export class FarmPlotsController {
  constructor(private readonly farmPlotsService: FarmPlotsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Creates a new farm plot and returns the overproduction risk analysis.' })
  @ApiResponse({ status: 201, description: 'Calculated risk returned.' })
  async create(@Req() req: any, @Body() dto: CreateFarmPlotDto) {
    const userId = req.user.id;
    const result = await this.farmPlotsService.create(userId, dto);
    return { success: true, data: result };
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retrieve all farm plots as GeoJSON entities.' })
  async findAll(@Req() req: { user: { id: string; role: any } }) {
    const data = await this.farmPlotsService.findAll(req.user.id, req.user.role);
    return { success: true, data };
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retrieve only the current user farm plots.' })
  async findMine(@Req() req: { user: { id: string } }) {
    const data = await this.farmPlotsService.findMine(req.user.id);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a farm plot by id.' })
  async update(
    @Req() req: { user: { id: string; role: any } },
    @Param('id') id: string,
    @Body() updateData: UpdateFarmPlotDto,
  ) {
    const data = await this.farmPlotsService.update(
      id,
      req.user.id,
      req.user.role,
      updateData,
    );
    return { success: true, data };
  }

  @Get(':id/competition')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Calculate competition score for a farm plot and decide marketplace visibility.' })
  async getCompetition(
    @Req() req: { user: { id: string; role: any } },
    @Param('id') id: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    const data = await this.farmPlotsService.getCompetitionByPlotId(
      id,
      req.user.id,
      req.user.role,
      radiusKm ? Number(radiusKm) : 5,
    );
    return { success: true, data };
  }

  @Get(':id/season-summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Calculate seasonal finance summary for a farm plot.' })
  async getSeasonSummary(
    @Req() req: { user: { id: string; role: any } },
    @Param('id') id: string,
  ) {
    const data = await this.farmPlotsService.getSeasonSummary(
      id,
      req.user.id,
      req.user.role,
    );
    return { success: true, data };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a farm plot by id.' })
  async remove(
    @Req() req: { user: { id: string; role: any } },
    @Param('id') id: string,
  ) {
    await this.farmPlotsService.remove(id, req.user.id, req.user.role);
    return { success: true };
  }
}
