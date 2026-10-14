import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CompanyStatus } from '../../domain';

export class UpdateCompanyDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  /** Địa chỉ http:// hoặc https://. */
  @IsOptional() @IsString() @MaxLength(300) website?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
}

export class CompanyProfileResponseDto {
  id!: number;
  name!: string;
  location!: string | null;
  website!: string | null;
  description!: string | null;
  status!: CompanyStatus;
}
