import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class BootstrapResellerUserDto {
	@IsIn(['entra'])
	provider!: 'entra';

	@IsString()
	providerSubject!: string;

	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	displayName?: string;

	@IsOptional()
	@IsString()
	issuer?: string;

	@IsOptional()
	@IsString()
	tenantId?: string;

	@IsOptional()
	@IsString()
	mpnId?: string;
}
