import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Req } from '@nestjs/common';
import { SupplierService,type SupplierInput } from './supplier.service.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string|undefined,name:string){if(!value||!uuid.test(value))throw new BadRequestException(`${name} must be UUID`);return value;}
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  findAll() {
    return this.service.findAllPublic();
  }

  @Post()
  create(@Body() body: any) {
    return this.service.createPublic(body);
  }

  @Get(':id/products')
  getProducts(@Param('id') supplierId: string) {
    return this.service.getSupplierProducts(supplierId);
  }

  @Post(':id/delete')
  delete(@Param('id') supplierId: string) {
    return this.service.deletePublic(supplierId);
  }
}
