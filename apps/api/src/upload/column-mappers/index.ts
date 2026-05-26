import type { ColumnMapper, SourceType } from '../upload.types';
import { renewalMicrosoftMapper } from './renewal-microsoft.mapper';
import { renewalPartnerMapper } from './renewal-partner.mapper';
import { clasMicrosoftMapper } from './clas-microsoft.mapper';
import { clasPartnerMapper } from './clas-partner.mapper';
import { customMapper } from './custom.mapper';

const mappers: Record<SourceType, ColumnMapper> = {
	RENEWAL_MICROSOFT: renewalMicrosoftMapper,
	RENEWAL_PARTNER: renewalPartnerMapper,
	CLAS_MICROSOFT: clasMicrosoftMapper,
	CLAS_PARTNER: clasPartnerMapper,
	CUSTOM: customMapper,
};

export function getMapper(sourceType: SourceType): ColumnMapper {
	return mappers[sourceType];
}
