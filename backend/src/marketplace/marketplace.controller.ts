import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketplaceService } from './marketplace.service';
import { CreateListingDto, UpdateListingDto } from './dto/create-listing.dto';

@ApiTags('Marketplace')
@Controller('marketplace/listings')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new marketplace listing' })
  create(@Req() req: any, @Body() createDto: CreateListingDto) {
    return this.marketplaceService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all listings' })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.marketplaceService.findAll(category, search, sortBy, sortOrder);
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all listings of the current farmer, including hidden ones' })
  findMine(@Req() req: any) {
    return this.marketplaceService.findMine(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific listing' })
  findOne(@Param('id') id: string) {
    return this.marketplaceService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a listing' })
  update(@Req() req: any, @Param('id') id: string, @Body() updateDto: UpdateListingDto) {
    return this.marketplaceService.update(id, req.user.id, updateDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a listing' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.marketplaceService.remove(id, req.user.id);
  }
}
