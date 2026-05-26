import zlib from 'node:zlib';
import yauzl from 'yauzl';

interface ZipEntryInput {
	name: string;
	data: Buffer;
}

const CRC_TABLE = buildCrcTable();

export async function readZipEntries(
	zipBuffer: Buffer,
): Promise<Map<string, Buffer>> {
	return new Promise((resolve, reject) => {
		const entries = new Map<string, Buffer>();

		yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (error, zipFile) => {
			if (error || !zipFile) {
				reject(error ?? new Error('Failed to read zip buffer'));
				return;
			}

			const cleanup = (err: Error) => {
				zipFile.close();
				reject(err);
			};

			zipFile.on('entry', (entry) => {
				if (entry.fileName.endsWith('/')) {
					entries.set(entry.fileName, Buffer.alloc(0));
					zipFile.readEntry();
					return;
				}

				zipFile.openReadStream(entry, (streamError, stream) => {
					if (streamError || !stream) {
						cleanup(
							streamError ?? new Error('Failed to open zip entry stream'),
						);
						return;
					}

					const chunks: Buffer[] = [];
					stream.on('data', (chunk: Buffer | string) => {
						chunks.push(
							typeof chunk === 'string'
								? Buffer.from(chunk)
								: Buffer.from(chunk),
						);
					});

					stream.on('error', (streamReadError) => {
						cleanup(streamReadError);
					});

					stream.on('end', () => {
						entries.set(entry.fileName, Buffer.concat(chunks));
						zipFile.readEntry();
					});
				});
			});

			zipFile.on('end', () => {
				resolve(entries);
			});

			zipFile.on('error', (zipError) => {
				cleanup(zipError);
			});

			zipFile.readEntry();
		});
	});
}

export function writeZipEntries(entries: Map<string, Buffer>): Buffer {
	const files = Array.from(entries.entries())
		.map(([name, data]) => ({ name, data }))
		.sort((left, right) => left.name.localeCompare(right.name));

	return writeZip(files);
}

function writeZip(entries: ZipEntryInput[]): Buffer {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const fileName = Buffer.from(entry.name, 'utf8');
		const isDirectory = entry.name.endsWith('/');
		const uncompressed = isDirectory ? Buffer.alloc(0) : entry.data;
		const compressed =
			isDirectory || uncompressed.length === 0
				? Buffer.alloc(0)
				: zlib.deflateRawSync(uncompressed);
		const compressionMethod = isDirectory || uncompressed.length === 0 ? 0 : 8;
		const crc = crc32(uncompressed);

		const localHeader = Buffer.alloc(30 + fileName.length);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(compressionMethod, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(uncompressed.length, 22);
		localHeader.writeUInt16LE(fileName.length, 26);
		localHeader.writeUInt16LE(0, 28);
		fileName.copy(localHeader, 30);

		localParts.push(localHeader, compressed);

		const centralHeader = Buffer.alloc(46 + fileName.length);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0, 8);
		centralHeader.writeUInt16LE(compressionMethod, 10);
		centralHeader.writeUInt16LE(0, 12);
		centralHeader.writeUInt16LE(0, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(uncompressed.length, 24);
		centralHeader.writeUInt16LE(fileName.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(isDirectory ? 0x10 : 0, 38);
		centralHeader.writeUInt32LE(offset, 42);
		fileName.copy(centralHeader, 46);
		centralParts.push(centralHeader);

		offset += localHeader.length + compressed.length;
	}

	const centralSize = centralParts.reduce(
		(total, part) => total + part.length,
		0,
	);
	const endOfCentralDirectory = Buffer.alloc(22);
	endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
	endOfCentralDirectory.writeUInt16LE(0, 4);
	endOfCentralDirectory.writeUInt16LE(0, 6);
	endOfCentralDirectory.writeUInt16LE(entries.length, 8);
	endOfCentralDirectory.writeUInt16LE(entries.length, 10);
	endOfCentralDirectory.writeUInt32LE(centralSize, 12);
	endOfCentralDirectory.writeUInt32LE(offset, 16);
	endOfCentralDirectory.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}

function crc32(buffer: Buffer): number {
	let crc = 0xffffffff;

	for (const byte of buffer) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
	}

	return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): number[] {
	const table: number[] = [];

	for (let i = 0; i < 256; i++) {
		let crc = i;
		for (let j = 0; j < 8; j++) {
			if ((crc & 1) !== 0) {
				crc = 0xedb88320 ^ (crc >>> 1);
			} else {
				crc >>>= 1;
			}
		}
		table[i] = crc >>> 0;
	}

	return table;
}
