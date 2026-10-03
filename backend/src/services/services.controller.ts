import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateServiceDto, UpdateServiceDto } from './dto/create-service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Return service categories.' })
  async getCategories() {
    const data = await this.servicesService.getCategories();
    return { success: true, data };
  }

  @Get('providers/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Return current provider profile and service stats.' })
  async getMyProviderProfile(@Req() req: { user: { id: string } }) {
    const data = await this.servicesService.getMyProviderProfile(req.user.id);
    return { success: true, data };
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Return current user service listings.' })
  async getMine(@Req() req: { user: { id: string } }) {
    const data = await this.servicesService.listMine(req.user.id);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Return service listings with filters.' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'district', required: false })
  @ApiQuery({ name: 'urgent', required: false })
  async list(
    @Query('category') category?: string,
    @Query('region') region?: string,
    @Query('district') district?: string,
    @Query('urgent') urgent?: string,
  ) {
    const data = await this.servicesService.listServices({
      category,
      region,
      district,
      urgent,
    });

    return { success: true, data };
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new service listing for the current provider.' })
  async create(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateServiceDto,
  ) {
    const data = await this.servicesService.createService(req.user.id, dto);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single service listing.' })
  async getOne(@Param('id') id: string) {
    const data = await this.servicesService.getServiceById(id);
    if (!data) {
      throw new NotFoundException('Service not found');
    }

    return { success: true, data };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update current provider service listing.' })
  async update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const data = await this.servicesService.updateService(id, req.user.id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete current provider service listing.' })
  async remove(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const data = await this.servicesService.removeService(id, req.user.id);
    return { success: true, data };
  }
}
