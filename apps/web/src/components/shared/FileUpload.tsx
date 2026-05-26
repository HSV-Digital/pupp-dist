'use client';

import { useCallback, useRef, useState } from 'react';
import { Body1, Caption1, Spinner } from '@fluentui/react-components';
import { ArrowUploadRegular } from '@fluentui/react-icons';
import type { ParseResult, RenewalSubscription } from '@repo/types';
import { parseFile } from '@/lib/data-parser';

interface FileUploadProps {
	onParsed: (data: RenewalSubscription[], result: ParseResult) => void;
	onError: (message: string) => void;
}

const ACCEPT = '.csv,.xlsx,.xls';

const DROP_ZONE_BASE =
	'flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer transition-colors';
const DROP_ZONE_ACTIVE = 'border-blue-500 bg-blue-50';
const ICON_CLASS = 'text-[32px] text-blue-600';

export function FileUpload({ onParsed, onError }: FileUploadProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [isParsing, setIsParsing] = useState(false);

	const handleFile = useCallback(
		async (file: File) => {
			const ext = file.name.split('.').pop()?.toLowerCase();
			if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
				onError('Unsupported file type. Please upload a CSV or Excel file.');
				return;
			}

			setIsParsing(true);
			try {
				const { data, result } = await parseFile(file);
				onParsed(data, result);
			} catch {
				onError('Failed to parse file. Please check the format and try again.');
			} finally {
				setIsParsing(false);
			}
		},
		[onParsed, onError],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			const file = e.dataTransfer.files[0];
			if (file) handleFile(file);
		},
		[handleFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) handleFile(file);
			if (inputRef.current) inputRef.current.value = '';
		},
		[handleFile],
	);

	if (isParsing) {
		return (
			<div className={DROP_ZONE_BASE}>
				<Spinner size="medium" label="Parsing file…" />
			</div>
		);
	}

	return (
		<div
			className={`${DROP_ZONE_BASE} ${isDragging ? DROP_ZONE_ACTIVE : ''}`}
			onClick={() => inputRef.current?.click()}
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<ArrowUploadRegular className={ICON_CLASS} />
			<Body1>Drag & drop a file here, or click to browse</Body1>
			<Caption1>Supports CSV, XLSX, and XLS files</Caption1>
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPT}
				onChange={handleInputChange}
				style={{ display: 'none' }}
			/>
		</div>
	);
}
