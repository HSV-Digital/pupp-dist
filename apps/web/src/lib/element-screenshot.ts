import html2canvas from 'html2canvas-pro';

export async function captureElementAsPngBlob(
	element: HTMLElement,
): Promise<Blob> {
	const canvas = await html2canvas(element, {
		backgroundColor: '#ffffff',
		scale: 2,
		useCORS: true,
		logging: false,
	});

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Failed to encode the screenshot as PNG'));
					return;
				}
				resolve(blob);
			},
			'image/png',
			1,
		);
	});
}

export async function captureElementByIdAsPngBlob(
	elementId: string,
): Promise<Blob> {
	const element = document.getElementById(elementId);
	if (!element || !(element instanceof HTMLElement)) {
		throw new Error(`Screenshot target "${elementId}" was not found`);
	}
	return captureElementAsPngBlob(element);
}
