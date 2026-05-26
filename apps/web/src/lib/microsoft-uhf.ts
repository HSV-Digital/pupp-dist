import jsdom from 'jsdom';

export interface MicrosoftUhfShell {
	css: string;
	js: string;
	header: string;
	footer: string;
}

const UHF_URL =
	'https://uhf.microsoft.com/en-US/shell/xml/MSCloudPrograms?headerId=MSCloudProgramsHeader&footerid=MSCloudProgramsFooter';

export async function fetchMicrosoftUhf(): Promise<MicrosoftUhfShell> {
	const res = await fetch(UHF_URL, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
		credentials: 'omit',
		next: { revalidate: 3600 },
	});

	const xmlText = await res.text();

	const dom = new jsdom.JSDOM();
	const parser = new dom.window.DOMParser();
	const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

	const cssRaw = xmlDoc.querySelector('cssIncludes')?.textContent ?? '';
	const htmlParser = new dom.window.DOMParser();
	const cssDom = htmlParser.parseFromString(cssRaw, 'text/html');
	const cssHref =
		cssDom.querySelector('link[href]')?.getAttribute('href') ?? '';

	let css = '';
	if (cssHref) {
		const cssRes = await fetch(cssHref, { next: { revalidate: 3600 } });
		if (cssRes.ok) {
			const cssText = await cssRes.text();
			// Strip font-family declarations so UHF CSS doesn't override app fonts.
			// UHF header/footer will inherit the app's Segoe UI instead.
			css = cssText.replace(/font-family:[^;}"]+[;]?/g, '');
		}
	}

	return {
		css,
		js: xmlDoc.querySelector('javascriptIncludes')?.textContent ?? '',
		header: xmlDoc.querySelector('headerHtml')?.textContent ?? '',
		footer: xmlDoc.querySelector('footerHtml')?.textContent ?? '',
	};
}
