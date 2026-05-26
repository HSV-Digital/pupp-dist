'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Dropdown,
	Option,
	Spinner,
	Tooltip,
} from '@fluentui/react-components';
import {
	ArrowDownloadRegular,
	BookOpenRegular,
	ChannelShare24Regular,
	CheckmarkCircleFilled,
	ChevronDownRegular,
	ChevronRightRegular,
	Circle12Filled,
	Circle12Regular,
	DocumentOnePage32Regular,
	DocumentOnePageRegular,
	FolderZipRegular,
	LinkRegular,
	MailRegular,
	SlideLayout20Regular,
	SlideText32Regular,
	VideoClipRegular,
} from '@fluentui/react-icons';
import { GTM_MANIFEST } from '@repo/shared';
import { OpenRegular } from '@fluentui/react-icons';
import type {
	GtmAssetCategory,
	GtmAssetEntry,
	GtmScenarioAssets,
} from '@repo/shared';
import { cspPartnerPublicApiFetch } from '@/lib/api-client';
import { type CreateCustomerProposalEmailLinkRequest } from '@/lib/customer-proposal-email-link';
import {
	createPartnerProposalEmailLink,
	createPartnerProposalEmailLinkPublic,
} from '@/lib/partner-proposal-email-link';
import {
	captureDownloadIntentClicked,
	captureProposalEmailLinkRequested,
} from '@/lib/posthog-product-events';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Build a unique key for selection tracking. */
function assetKey(endingSkuId: string, fileName: string): string {
	return `${endingSkuId}/${fileName}`;
}

const SALES_ENABLEMENT_PDF_BASE_URL =
	'https://agentbprodstorage.blob.core.windows.net/pdf-exports/sales-enablement';

const SALES_ENABLEMENT_PDFS: Record<
	string,
	{ label: string; fileName: string }
> = {
	bs_cb: {
		label: 'Copilot Business + Business Standard',
		fileName: 'Copilot Business + Business Standard.pdf',
	},
	bp_cb: {
		label: 'Copilot Business + Business Premium',
		fileName: 'Copilot Business + Business Premium.pdf',
	},
	bp_cb_purview: {
		label: 'Copilot Business + Business Premium + Purview',
		fileName:
			'Copilot Business + Business Premium + Purview Suite for Business Premium.pdf',
	},
	bp_defender: {
		label: 'Business Premium + Defender',
		fileName: 'Business Premium + Defender Suite for Business Premium.pdf',
	},
	bp_purview: {
		label: 'Business Premium + Purview',
		fileName: 'Business Premium + Purview Suite for Business Premium.pdf',
	},
	bp_defender_purview: {
		label: 'Business Premium + Defender + Purview',
		fileName:
			'Business Premium + Defender Suite for Business Premium + Purview Suite for Business Premium.pdf',
	},
};

interface ExternalLink {
	label: string;
	url: string;
}

const COPILOT_BUSINESS_LINKS: ExternalLink[] = [
	{
		label: 'Business Case Builder',
		url: 'https://bcbv2.transform.microsoft.com/',
	},
	{
		label: 'Copilot and Chat envisioning tool',
		url: 'https://microsoftpartners.microsoft.com/Downloads/?filename=abs/protected/Copilot-Chat-Value-Envisioning-Tool.xlsx',
	},
];

const COPILOT_BUSINESS_AGENTS_LINK: ExternalLink = {
	label: 'Building Agents with Microsoft Pitch deck',
	url: 'https://microsoftpartners.microsoft.com/Downloads/?filename=abs/unprotected/Building-Agents-with-MS-pitch-deck.pptx',
};

const GTM_KIT_CONTENTS: Array<{
	label: string;
	icon: React.ReactNode;
}> = [
	{
		label: 'Customer pitch deck',
		icon: <SlideText32Regular className="size-4 text-red-500" />,
	},
	{
		label: 'Promotion one-sliders',
		icon: <SlideLayout20Regular className="size-4 text-purple-500" />,
	},
	{
		label: 'To-customer flyers',
		icon: <DocumentOnePage32Regular className="size-4 text-indigo-600" />,
	},
	{
		label: 'To-customer e-mails',
		icon: <MailRegular className="size-4 text-yellow-600" />,
	},
	{
		label: 'Sizzle videos',
		icon: <VideoClipRegular className="size-4 text-teal-500" />,
	},
];

const GTM_KIT_LANGUAGES: ExternalLink[] = [
	{
		label: 'English',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit.zip',
	},
	{
		label: 'Brazilian Portuguese',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit.zip',
	},
	{
		label: 'Spanish',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Spanish.zip',
	},
	{
		label: 'French',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-French.zip',
	},
	{
		label: 'German',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-German.zip',
	},
	{
		label: 'Japanese',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Japanese.zip',
	},
	{
		label: 'Simplified Chinese',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-ChineseSimp.zip',
	},
	{
		label: 'Traditional Chinese',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-ChineseTrad.zip',
	},
	{
		label: 'Italian',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Italian.zip',
	},
	{
		label: 'Russian',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Russian.zip',
	},
	{
		label: 'Korean',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Korean.zip',
	},
	{
		label: 'Turkish',
		url: 'https://microsoftpartners.microsoft.com/downloads?filename=abs/protected/M365-Copilot-Business-Launch-Kit-Turkish.zip',
	},
];

const TECH_READINESS_COPILOT: ExternalLink[] = [
	{
		label: 'Copilot technical overview presentation',
		url: 'https://microsoftpartners.microsoft.com/Downloads/?filename=abs/unprotected/M365-Copilot-technical-overview.pptx',
	},
	{
		label: 'Copilot technical readiness guide',
		url: 'https://view.officeapps.live.com/op/view.aspx?src=https%3A%2F%2Fadoption.microsoft.com%2Ffiles%2Fcopilot%2F4_TechnicalReadinessGuide_Microsoft365Copilot.pptx&wdOrigin=BROWSELINK',
	},
];

const TECH_READINESS_PURVIEW: ExternalLink[] = [
	{
		label: 'Manage insider risk in Microsoft 365 learning path',
		url: 'https://learn.microsoft.com/en-us/training/paths/m365-compliance-insider/',
	},
	{
		label: 'Compliance learning paths',
		url: 'https://learn.microsoft.com/en-us/training/paths/describe-capabilities-of-microsoft-compliance-solutions/',
	},
	{
		label: 'Purview and Priva learning path',
		url: 'https://learn.microsoft.com/en-us/training/paths/purview-ninja-safeguard-data/',
	},
	{
		label: 'Purview Data Loss Preventions ninja training',
		url: 'https://aka.ms/DLPNinja',
	},
	{
		label: 'Purview eDiscovery ninja training',
		url: 'https://techcommunity.microsoft.com/blog/microsoftsecurityandcompliance/become-a-microsoft-purview-ediscovery-ninja/2793108',
	},
];

const TECH_READINESS_DEFENDER: ExternalLink[] = [
	{
		label: 'Microsoft Defender learning path',
		url: 'https://learn.microsoft.com/en-us/training/defender/',
	},
	{
		label: 'Microsoft Defender XDR learning path',
		url: 'https://learn.microsoft.com/en-us/training/modules/describe-threat-protection-with-microsoft-365-defender/',
	},
	{
		label: 'Additional training resources',
		url: 'https://learn.microsoft.com/en-us/defender/',
	},
];

const ADOPTION_COPILOT: ExternalLink[] = [
	{
		label:
			'User enablement tools and templates: Programs; prompting guides and packs; Training handouts; Lunch and learn courses',
		url: 'https://adoption.microsoft.com/en-us/copilot/user-engagement-tools-and-templates/',
	},
	{
		label: 'Copilot analytics risk and compliance discussion guide',
		url: 'https://aka.ms/Copilot/RiskComplianceDiscussionGuide',
	},
	{
		label: 'Building first agent in minutes',
		url: 'https://adoption.microsoft.com/files/copilot/AgentBuilderQuickStart.pdf',
	},
	{
		label: 'Agent governance',
		url: 'https://adoption.microsoft.com/files/customer-hub/Customer-Hub_Agent-governance.pptx',
	},
];

const ADOPTION_PURVIEW_INTERACTIVE_GUIDES: ExternalLink[] = [
	{
		label: 'Data Loss Protection',
		url: 'https://mslearn.cloudguides.com/en-us/guides/Apply%20Microsoft%20Endpoint%20DLP%20policies%20to%20devices',
	},
	{
		label: 'Information and Rights Management',
		url: 'https://mslearn.cloudguides.com/en-us/guides/Identify%20and%20take%20action%20on%20insider%20risks%20with%20Insider%20Risk%20Management',
	},
	{
		label: 'Adaptive Protection',
		url: 'https://mslearn.cloudguides.com/guides/Mitigate%20risks%20with%20Adaptive%20Protection%20in%20Microsoft%20Purview',
	},
	{
		label: 'eDiscovery',
		url: 'https://mslearn.cloudguides.com/guides/Get%20started%20with%20Microsoft%20Purview%20eDiscovery',
	},
];

const ADOPTION_PURVIEW_TOP: ExternalLink = {
	label:
		'Microsoft Security adoption guide: A practical handbook to securing data with Purview',
	url: 'https://adoption.microsoft.com/en-us/microsoft-security/purview/',
};

const ADOPTION_PURVIEW_BOTTOM: ExternalLink[] = [
	{
		label: 'Clickthrough demos',
		url: 'https://app.highlights.guide/gallery?products=microsoft%20purview',
	},
	{
		label: 'Additional implementation and adoption resources',
		url: 'https://adoption.microsoft.com/en-us/microsoft-security/purview/?role=developer',
	},
];

const ADOPTION_DEFENDER: ExternalLink[] = [
	{
		label: 'Microsoft Security adoption guide',
		url: 'https://aka.ms/security_adoption_guide',
	},
];

const PURVIEW_EMAIL_LABEL_OVERRIDES: Record<string, string> = {
	'E-mail_8_Unlock the power and promise of AI.oft':
		'E-mail 1 – Unlock the power and promise of AI',
	'E-mail_9_Prevent the risk of data leak in the age of AI.oft':
		'E-mail 2 – Prevent data leak in the age of AI',
	'E-mail_10_Prevent the risk of data oversharing in the age of AI.oft':
		'E-mail 3 – Prevent data oversharing in the age of AI',
	'E-mail_11_Prevent the risk of non-compliance in the age of AI.oft':
		'E-mail 4 – Prevent non-compliance in the age of AI',
};

const DEFENDER_EMAIL_FILES = new Set([
	'E-mail_1_Elevate security and compliance in this new world.oft',
	'E-mail_2_Elevate threat protection at SMB cost.oft',
	'E-mail_3_Prevent identity access risks in a connected world.oft',
	'E-mail_4_Prevent the risk of advanced identity-based attacks.oft',
	'E-mail_5_Prevent the risk of ransomware attacks across endpoints network.oft',
	'E-mail_6_Prevent advanced phishing and email threats.oft',
	'E-mail_7_Prevent the risk from shadow cloud and AI applications.oft',
]);

const PURVIEW_EMAIL_FILES = new Set(Object.keys(PURVIEW_EMAIL_LABEL_OVERRIDES));

/** Map a GTM asset category to a Fluent icon. */
function getCategoryIcon(category: GtmAssetCategory) {
	switch (category) {
		case 'deck':
			return <SlideText32Regular className="size-4 text-red-500" />;
		case 'email':
			return <MailRegular className="size-4 text-yellow-600" />;
		case 'flyer':
			return <DocumentOnePage32Regular className="size-4 text-indigo-600" />;
		case 'social':
			return <ChannelShare24Regular className="size-4 text-teal-500" />;
		case 'slider':
			return <SlideLayout20Regular className="size-4 text-purple-500" />;
		default:
			return <DocumentOnePageRegular className="size-4 text-indigo-600" />;
	}
}

/* ------------------------------------------------------------------ */
/*  AssetListItem                                                     */
/* ------------------------------------------------------------------ */

interface AssetListItemProps {
	icon: React.ReactNode;
	title: string;
	subtitle?: string;
	loading?: boolean;
	disabled?: boolean;
	error?: string | null;
	/** Direct link — renders an <a> download button. */
	actionHref?: string;
	/** Async callback — renders a <button> download button. */
	onAction?: () => void;
	onIntentClick?: () => void;
	ariaLabel?: string;
	/** Indent this item (used for child items under a parent). */
	indent?: boolean;
	/** Show a border between items. */
	border?: boolean;
	/** Override the default download icon on the action button. */
	actionIcon?: React.ReactElement;
}

function AssetListItem({
	icon,
	title,
	subtitle,
	loading = false,
	disabled = false,
	error = null,
	actionHref,
	onAction,
	onIntentClick,
	ariaLabel,
	indent = false,
	border = false,
	actionIcon,
}: AssetListItemProps) {
	const downloadIcon = loading ? (
		<Spinner size="tiny" />
	) : (
		(actionIcon ?? <ArrowDownloadRegular className="size-4" />)
	);

	return (
		<div className={`flex flex-col ${indent ? 'pl-6' : ''}`}>
			<div
				className={`flex items-center gap-3 py-2 pr-2 ${border ? 'border-b border-gray-100/70' : ''}`}
			>
				{/* File-type icon */}
				<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
					{icon}
				</span>

				{/* Title + subtitle */}
				<div className="min-w-0 flex-1">
					<Tooltip content={title} relationship="label">
						<p className="m-0 truncate text-sm pr-8 font-medium text-gray-800">
							{title}
						</p>
					</Tooltip>
					{subtitle && (
						<p className="m-0 truncate text-xs text-gray-500">{subtitle}</p>
					)}
				</div>

				{/* Download action */}
				{actionHref ? (
					<Button
						appearance="subtle"
						icon={downloadIcon}
						as="a"
						href={actionHref}
						target="_blank"
						rel="noopener noreferrer"
						onClick={onIntentClick}
						disabled={disabled || loading}
						aria-label={ariaLabel ?? `Download ${title}`}
						size="small"
					/>
				) : (
					<Button
						appearance="subtle"
						icon={downloadIcon}
						onClick={() => {
							onIntentClick?.();
							onAction?.();
						}}
						disabled={disabled || loading}
						aria-label={ariaLabel ?? `Download ${title}`}
						size="small"
					/>
				)}
			</div>

			{error && <p className="m-0 pl-11 text-xs text-[#b42318]">{error}</p>}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  GtmAssetListItem                                                  */
/* ------------------------------------------------------------------ */

interface GtmAssetListItemProps {
	icon: React.ReactNode;
	label: string;
	selected: boolean;
	onToggle: () => void;
}

function GtmAssetListItem({
	icon,
	label,
	selected,
	onToggle,
}: GtmAssetListItemProps) {
	return (
		<div
			role="checkbox"
			aria-checked={selected}
			tabIndex={0}
			onClick={onToggle}
			onKeyDown={(e) => {
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault();
					onToggle();
				}
			}}
			className="group flex items-center gap-2 py-1.5 px-2 ml-4 cursor-pointer hover:bg-gray-100 rounded-lg"
		>
			<div className="flex size-4 shrink-0 items-center">
				{selected ? (
					<CheckmarkCircleFilled primaryFill="var(--ds-color-violet-500)" className="size-4" />
				) : (
					<>
						{/* Default: file-type icon */}
						<div className="group-hover:hidden h-lh text-gray-400 flex items-center justify-center">
							{icon}
						</div>
						{/* Hover: empty circle */}
						<div className="hidden group-hover:flex h-lh text-gray-300 items-center justify-center">
							<Circle12Regular className="size-4" />
						</div>
					</>
				)}
			</div>
			<p className="text-xs text-gray-700 truncate">{label}</p>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

interface AssetsLeftColumnProps {
	customerName: string;
	endingSkuIds: string[];
	showConsolidatedPpt?: boolean;
	showPartnerEmail?: boolean;
	loading?: boolean;
	customerProposalEmailRequest?: CreateCustomerProposalEmailLinkRequest | null;
	proposalDownloadUrl?: string | null;
	individualPpts?: Array<{
		key: string;
		label: string;
		downloadUrl: string | null;
		loading?: boolean;
		error?: string | null;
		onDownload?: () => void;
	}>;
	isDemo?: boolean;
	isPublic?: boolean;
	showCspPartnerResources?: boolean;
}

export function AssetsLeftColumn({
	customerName,
	endingSkuIds,
	showConsolidatedPpt = true,
	showPartnerEmail = true,
	loading = false,
	customerProposalEmailRequest = null,
	proposalDownloadUrl = null,
	individualPpts = [],
	isDemo = false,
	isPublic = false,
	showCspPartnerResources = false,
}: AssetsLeftColumnProps) {
	const t = useTranslations();
	const [selectedResources, setSelectedResources] = useState<Set<string>>(
		() => new Set(),
	);
	const [downloadingScenario, setDownloadingScenario] = useState<string | null>(
		null,
	);
	const [downloadingCustomerEmail, setDownloadingCustomerEmail] =
		useState(false);
	const [customerEmailError, setCustomerEmailError] = useState<string | null>(
		null,
	);
	const [purviewGuidesExpanded, setPurviewGuidesExpanded] = useState(false);
	const [gtmKitLanguage, setGtmKitLanguage] = useState<string>(
		GTM_KIT_LANGUAGES[0]?.label ?? 'English',
	);
	const selectedGtmKitUrl = useMemo(
		() =>
			GTM_KIT_LANGUAGES.find((l) => l.label === gtmKitLanguage)?.url ??
			GTM_KIT_LANGUAGES[0]?.url ??
			'',
		[gtmKitLanguage],
	);

	const scenarioAssets = useMemo(() => {
		const unique = [...new Set(endingSkuIds)];

		// Collapse all Copilot-related ending SKUs (bs_cb, bp_cb, bp_cb_purview)
		// into a single "Copilot Business" GTM entry — the kit is the same
		// regardless of the Business Standard/Premium leg in the upgrade path.
		const copilotSkuIds = new Set<string>(['bs_cb', 'bp_cb', 'bp_cb_purview']);
		const selectedCopilotIds = unique.filter((id) => copilotSkuIds.has(id));
		const canonicalCopilotId = selectedCopilotIds.includes('bs_cb')
			? 'bs_cb'
			: (selectedCopilotIds[0] ?? null);
		const hasCopilotSpecialBlock =
			showCspPartnerResources && selectedCopilotIds.length > 0;

		return unique
			.filter((id) => {
				if (!copilotSkuIds.has(id)) return true;
				// In CSP-partner mode, the dedicated "Copilot Business" block already
				// represents every Copilot SKU — skip them all in scenarioAssets.
				if (hasCopilotSpecialBlock) return false;
				return id === canonicalCopilotId;
			})
			.map((id) => {
				if (showCspPartnerResources && id === 'bs_cb') return null;
				const manifest = GTM_MANIFEST[id];
				if (!manifest) return null;
				const isCopilotCanonical =
					selectedCopilotIds.length > 0 && id === canonicalCopilotId;
				const label = isCopilotCanonical ? 'Copilot Business' : manifest.label;
				if (!showCspPartnerResources) {
					return { endingSkuId: id, ...manifest, label };
				}
				let assets = manifest.assets;
				if (id === 'bp_defender') {
					assets = assets.filter(
						(a) =>
							a.category !== 'email' || DEFENDER_EMAIL_FILES.has(a.fileName),
					);
				} else if (id === 'bp_purview') {
					assets = assets
						.filter(
							(a) =>
								a.category !== 'email' ||
								PURVIEW_EMAIL_FILES.has(a.fileName),
						)
						.map((a) =>
							PURVIEW_EMAIL_LABEL_OVERRIDES[a.fileName]
								? {
										...a,
										label: PURVIEW_EMAIL_LABEL_OVERRIDES[a.fileName],
									}
								: a,
						);
				} else if (id === 'bp_defender_purview') {
					assets = assets
						.filter(
							(a) =>
								a.category !== 'email' ||
								DEFENDER_EMAIL_FILES.has(a.fileName) ||
								PURVIEW_EMAIL_FILES.has(a.fileName),
						)
						.map((a) =>
							PURVIEW_EMAIL_LABEL_OVERRIDES[a.fileName]
								? {
										...a,
										label: PURVIEW_EMAIL_LABEL_OVERRIDES[a.fileName],
									}
								: a,
						);
				}
				return { endingSkuId: id, ...manifest, label, assets };
			})
			.filter(
				(s): s is { endingSkuId: string } & GtmScenarioAssets => s !== null,
			);
	}, [endingSkuIds, showCspPartnerResources]);

	const hasCopilotBusiness = useMemo(
		() =>
			showCspPartnerResources &&
			endingSkuIds.some(
				(id) => id === 'bs_cb' || id === 'bp_cb' || id === 'bp_cb_purview',
			),
		[endingSkuIds, showCspPartnerResources],
	);

	const hasCopilotSku = useMemo(
		() => endingSkuIds.some((id) => id.includes('_cb') || id === 'bs_cb'),
		[endingSkuIds],
	);

	const hasPurviewSku = useMemo(
		() => endingSkuIds.some((id) => id.includes('purview')),
		[endingSkuIds],
	);

	const hasDefenderSku = useMemo(
		() => endingSkuIds.some((id) => id.includes('defender')),
		[endingSkuIds],
	);

	const showTechReadiness =
		showCspPartnerResources &&
		(hasCopilotSku || hasPurviewSku || hasDefenderSku);
	const showAdoptionResources =
		showCspPartnerResources &&
		(hasCopilotSku || hasPurviewSku || hasDefenderSku);

	const salesEnablementPdfs = useMemo(() => {
		const unique = [...new Set(endingSkuIds)];
		return unique
			.map((id) => {
				const pdf = SALES_ENABLEMENT_PDFS[id];
				if (!pdf) return null;
				return {
					id,
					label:
						showCspPartnerResources && id === 'bs_cb'
							? 'Copilot Business'
							: pdf.label,
					url: `${SALES_ENABLEMENT_PDF_BASE_URL}/${encodeURIComponent(pdf.fileName)}`,
				};
			})
			.filter(
				(p): p is { id: string; label: string; url: string } => p !== null,
			);
	}, [endingSkuIds, showCspPartnerResources]);

	const toggleResource = useCallback((key: string) => {
		setSelectedResources((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const toggleScenario = useCallback(
		(scenario: { endingSkuId: string; assets: GtmAssetEntry[] }) => {
			setSelectedResources((prev) => {
				const next = new Set(prev);
				const keys = scenario.assets.map((a) =>
					assetKey(scenario.endingSkuId, a.fileName),
				);
				const allSelected = keys.every((k) => next.has(k));

				for (const key of keys) {
					if (allSelected) {
						next.delete(key);
					} else {
						next.add(key);
					}
				}
				return next;
			});
		},
		[],
	);

	const handleDownloadScenario = useCallback(
		async (scenario: { endingSkuId: string; assets: GtmAssetEntry[] }) => {
			const fileNames = scenario.assets
				.filter((a) =>
					selectedResources.has(assetKey(scenario.endingSkuId, a.fileName)),
				)
				.map((a) => a.fileName);
			if (fileNames.length === 0) return;

			captureDownloadIntentClicked({
				intentType: 'gtm-bundle',
				assetType: 'bundle-zip',
				scenarioId: scenario.endingSkuId,
				selectedAssetCount: fileNames.length,
				isDemo,
				isPublic: true,
			});

			setDownloadingScenario(scenario.endingSkuId);
			try {
				const response = await cspPartnerPublicApiFetch('/api/gtm/bundle/link', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						selectedAssets: [{ endingSkuId: scenario.endingSkuId, fileNames }],
					}),
				});

				if (!response.ok) {
					const err = (await response.json().catch(() => null)) as {
						message?: string;
					} | null;
					throw new Error(err?.message ?? 'Failed to create download link');
				}

				const { url } = (await response.json()) as { url: string };
				window.location.href = url;
			} catch (error) {
				console.error('GTM bundle download failed:', error);
			} finally {
				setDownloadingScenario(null);
			}
		},
		[selectedResources],
	);

	const handleDownloadPartnerEmail = useCallback(async () => {
		setCustomerEmailError(null);

		if (!customerProposalEmailRequest) {
			setCustomerEmailError(
				'No proposal selection is available to build the email.',
			);
			return;
		}

		const pendingTab = window.open('', '_blank');
		if (!pendingTab) {
			setCustomerEmailError(
				'Popup blocked by browser. Allow popups and try again.',
			);
			return;
		}
		pendingTab.opener = null;

		setDownloadingCustomerEmail(true);
		try {
			const response = await (isPublic
				? createPartnerProposalEmailLinkPublic(customerProposalEmailRequest)
				: createPartnerProposalEmailLink(customerProposalEmailRequest));
			captureProposalEmailLinkRequested({
				linkType: 'partner-ready-email',
				customerId: customerProposalEmailRequest.customerId,
				scenarioCount: customerProposalEmailRequest.scenarios.length,
				isDemo,
				isPublic,
			});
			if (pendingTab.closed) {
				window.open(response.url, '_blank', 'noopener,noreferrer');
			} else {
				pendingTab.location.href = response.url;
			}
		} catch (error) {
			if (!pendingTab.closed) {
				pendingTab.close();
			}
			setCustomerEmailError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to generate the partner email. Please try again.',
			);
		} finally {
			setDownloadingCustomerEmail(false);
		}
	}, [customerProposalEmailRequest, isDemo, isPublic]);

	if (loading) {
		return (
			<div
				className="rounded-xl bg-white backdrop-blur-[80px] border-2 border-white p-4"
				aria-busy={true}
			>
				<div data-testid="assets-left-skeleton-customer">
					<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
						{t('proposal.downloadProposalPack')}
					</h3>
					<div className="mt-3 flex flex-col">
						<div className="flex items-center gap-3 border-b border-gray-100/70 py-2 pr-2">
							<div className="size-8 animate-pulse rounded-md bg-gray-200" />
							<div className="flex-1">
								<div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
								<div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-gray-100" />
							</div>
							<div className="size-7 animate-pulse rounded-md bg-gray-100" />
						</div>
						{[0, 1, 2].map((index) => (
							<div
								key={index}
								className={`flex items-center gap-3 py-2 pr-2 ${index < 2 ? 'border-b border-gray-100/70' : ''} pl-6`}
							>
								<div className="size-8 animate-pulse rounded-md bg-gray-200" />
								<div className="flex-1">
									<div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
									<div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
								</div>
								<div className="size-7 animate-pulse rounded-md bg-gray-100" />
							</div>
						))}
					</div>
				</div>

				{showPartnerEmail && (
					<>
						<hr className="my-4 border-t border-gray-200" />
						<div data-testid="assets-left-skeleton-partner">
							<h3 className="m-0 text-sm font-semibold text-gray-500 uppercase tracking-wide">
								Partner ready proposal assets
							</h3>
							<div className="mt-3 flex items-center gap-3 py-2 pr-2">
								<div className="size-8 animate-pulse rounded-md bg-gray-200" />
								<div className="flex-1">
									<div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
									<div className="mt-2 h-2.5 w-2/3 animate-pulse rounded bg-gray-100" />
								</div>
								<div className="size-7 animate-pulse rounded-md bg-gray-100" />
							</div>
						</div>
					</>
				)}

				{endingSkuIds.length > 0 && (
					<>
						<hr className="my-4 border-t border-gray-200" />
						<div data-testid="assets-left-skeleton-gtm">
							<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
								{t('proposal.downloadGtmResources')}
							</h3>
							<p className="m-0 mt-1 text-xs text-gray-500">
								Select assets per scenario
							</p>
							<div className="mt-3 flex flex-col gap-4">
								{[0, 1].map((scenarioIndex) => (
									<div key={scenarioIndex}>
										<div className="flex items-center gap-2">
											<div className="size-4 animate-pulse rounded-full bg-gray-200" />
											<div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
											<div className="ml-auto size-7 animate-pulse rounded-md bg-gray-100" />
										</div>
										<div className="mt-2 space-y-2 pl-6">
											<div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
											<div className="h-3 w-2/3 animate-pulse rounded bg-gray-100" />
										</div>
									</div>
								))}
							</div>
						</div>
					</>
				)}
			</div>
		);
	}

	return (
		<div
			className="rounded-xl bg-white backdrop-blur-[80px] border-2 border-white p-4"
			aria-busy={false}
		>
			{/* ── Section 1: Download the customer-ready proposal pack ────── */}
			<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
				{t('proposal.downloadProposalPack')}
			</h3>

			<div className="mt-3 flex flex-col">
				{/* Proactive Proposal (ZIP) — parent */}
				<AssetListItem
					icon={
						<FolderZipRegular className="size-4 text-(--ds-color-violet-500)" />
					}
					title={`Proactive Proposal for ${customerName}`}
					subtitle={t('proposal.readyToSendCustomerProposal')}
					actionHref={proposalDownloadUrl ?? undefined}
					onIntentClick={() =>
						captureDownloadIntentClicked({
							intentType: 'proposal-bundle',
							assetType: 'bundle-zip',
							customerName,
							isDemo,
							isPublic,
						})
					}
					disabled={!proposalDownloadUrl}
					border
				/>

				{/* PPT — child */}
				{showConsolidatedPpt && (
					<AssetListItem
						indent
						icon={<SlideText32Regular className="size-4 text-red-500" />}
						title={t('proposal.consolidatedProposalDoc')}
						subtitle=".pptx"
						actionHref={
							proposalDownloadUrl
								? `${proposalDownloadUrl}&file=ppt`
								: undefined
						}
						onIntentClick={() =>
							captureDownloadIntentClicked({
								intentType: 'consolidated-proposal',
								assetType: 'pptx',
								customerName,
								isDemo,
								isPublic,
							})
						}
						disabled={!proposalDownloadUrl}
						border
					/>
				)}

				{/* Individual opportunity PPTs */}
				{individualPpts.map((ppt, index) => (
					<AssetListItem
						key={ppt.key}
						indent
						icon={<SlideText32Regular className="size-4 text-red-500" />}
						title={ppt.label}
						subtitle=".pptx"
						actionHref={ppt.downloadUrl ?? undefined}
						onAction={ppt.downloadUrl ? undefined : ppt.onDownload}
						onIntentClick={() =>
							captureDownloadIntentClicked({
								intentType: 'individual-proposal',
								assetType: 'pptx',
								scenarioKey: ppt.key,
								customerName,
								isDemo,
								isPublic,
							})
						}
						loading={ppt.loading}
						error={ppt.error}
						disabled={!ppt.downloadUrl && !ppt.onDownload}
						border={index < individualPpts.length - 1}
					/>
				))}

				{/* DOCX — child */}
				<AssetListItem
					indent
					icon={<DocumentOnePage32Regular className="size-4 text-indigo-600" />}
					title={t('proposal.customerProposalEmail')}
					subtitle=".docx"
					actionHref={
						proposalDownloadUrl
							? `${proposalDownloadUrl}&file=email`
							: undefined
					}
					onIntentClick={() =>
						captureDownloadIntentClicked({
							intentType: 'customer-proposal-email',
							assetType: 'docx',
							customerName,
							isDemo,
							isPublic,
						})
					}
					disabled={!proposalDownloadUrl}
				/>
			</div>

			{/* ── Divider ──────────────────────────────────────── */}
			{showPartnerEmail && <hr className="my-4 border-t border-gray-200" />}

			{/* ── Section 2: Partner Ready Proposal Assets ─────── */}
			{showPartnerEmail && (
				<>
					<h3 className="m-0 text-sm font-semibold text-gray-500 uppercase tracking-wide">
						{t('proposal.partnerReadyAssets')}
					</h3>

					<div className="mt-3 flex flex-col">
						<AssetListItem
							icon={<MailRegular className="size-4 text-yellow-600" />}
							title={t('proposal.partnerReadyEmail')}
							subtitle={t('proposal.emailToPartnerSubtitle')}
							loading={downloadingCustomerEmail}
							disabled={!customerProposalEmailRequest}
							onAction={handleDownloadPartnerEmail}
							error={customerEmailError}
							ariaLabel="Download partner e-mail"
						/>
					</div>
				</>
			)}

			{/* ── Section 2b: Sales Enablement PDFs ────────────── */}
			{salesEnablementPdfs.length > 0 && (
				<>
					<hr className="my-4 border-t border-gray-200" />
					<h3 className="m-0 text-sm font-semibold text-gray-500 uppercase tracking-wide">
						{t('proposal.exploreSalesGuidance')}
					</h3>

					<div className="mt-3 flex flex-col">
						{salesEnablementPdfs.map((pdf, index) => (
							<AssetListItem
								key={pdf.id}
								icon={
									<DocumentOnePage32Regular className="size-4 text-indigo-600" />
								}
								title={pdf.label}
								subtitle=".pdf"
								actionHref={pdf.url}
								onIntentClick={() =>
									captureDownloadIntentClicked({
										intentType: 'sales-enablement-pdf',
										assetType: 'pdf',
										scenarioId: pdf.id,
										customerName,
										isDemo,
										isPublic,
									})
								}
								border={index < salesEnablementPdfs.length - 1}
							/>
						))}
					</div>
				</>
			)}

			{/* ── Divider ──────────────────────────────────────── */}
			{(scenarioAssets.length > 0 || hasCopilotBusiness) && (
				<hr className="my-4 border-t border-gray-200" />
			)}

			{/* ── Section 3: Download additional GTM resources ────────────────────── */}
			{(scenarioAssets.length > 0 || hasCopilotBusiness) && (
				<>
					<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
						{t('proposal.downloadGtmResources')}
					</h3>
					<p className="m-0 mt-1 text-xs text-gray-500">
						{hasCopilotBusiness && scenarioAssets.length === 0
							? 'Resources for Copilot Business'
							: 'Select assets per scenario'}
					</p>

					<div className="mt-3 flex flex-col gap-4">
						{hasCopilotBusiness && (
							<div>
								<div className="flex items-center gap-2">
									<Circle12Filled
										primaryFill="currentColor"
										className="size-4 shrink-0 text-gray-300"
									/>
									<span className="text-sm font-semibold text-gray-700 truncate">
										Copilot Business
									</span>
								</div>

								<div className="mt-2 flex flex-col">
									{COPILOT_BUSINESS_LINKS.map((link) => (
										<AssetListItem
											key={link.label}
											indent
											icon={
												<LinkRegular className="size-4 text-indigo-600" />
											}
											title={link.label}
											actionHref={link.url}
											actionIcon={<OpenRegular className="size-4" />}
											onIntentClick={() =>
												captureDownloadIntentClicked({
													intentType: 'copilot-business-resource',
													assetType: 'external-link',
													scenarioId: 'bs_cb',
													customerName,
													isDemo,
													isPublic,
												})
											}
										/>
									))}

									{/* GTM Kit — language dropdown + bundled-asset list */}
									<div className="flex flex-col pl-6">
										<div className="flex items-center gap-2 py-2 pr-2">
											<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
												<FolderZipRegular className="size-4 text-(--ds-color-violet-500)" />
											</span>
											<p className="m-0 shrink-0 text-sm font-medium text-gray-800">
												GTM Kit
											</p>
											<Dropdown
												className="!min-w-0 !w-32 ml-auto"
												size="small"
												value={gtmKitLanguage}
												selectedOptions={[gtmKitLanguage]}
												onOptionSelect={(_, data) => {
													if (data.optionValue) {
														setGtmKitLanguage(data.optionValue);
													}
												}}
												aria-label="Select GTM Kit language"
											>
												{GTM_KIT_LANGUAGES.map((lang) => (
													<Option key={lang.label} value={lang.label}>
														{lang.label}
													</Option>
												))}
											</Dropdown>
											<Button
												appearance="subtle"
												icon={<OpenRegular className="size-4" />}
												as="a"
												href={selectedGtmKitUrl}
												target="_blank"
												rel="noopener noreferrer"
												onClick={() =>
													captureDownloadIntentClicked({
														intentType: 'gtm-kit-language',
														assetType: 'zip',
														scenarioId: 'bs_cb',
														language: gtmKitLanguage,
														customerName,
														isDemo,
														isPublic,
													})
												}
												aria-label={`Open GTM Kit (${gtmKitLanguage})`}
												size="small"
											/>
										</div>

										<div className="flex flex-col pl-6">
											{GTM_KIT_CONTENTS.map((item) => (
												<div
													key={item.label}
													className="flex items-center gap-2 py-1.5 px-2 rounded-lg"
												>
													<div className="flex size-4 shrink-0 items-center text-gray-400">
														{item.icon}
													</div>
													<p className="text-xs text-gray-700 truncate">
														{item.label}
													</p>
												</div>
											))}
										</div>
									</div>

									<AssetListItem
										indent
										icon={
											<SlideText32Regular className="size-4 text-red-500" />
										}
										title={COPILOT_BUSINESS_AGENTS_LINK.label}
										subtitle=".pptx"
										actionHref={COPILOT_BUSINESS_AGENTS_LINK.url}
										actionIcon={<OpenRegular className="size-4" />}
										ariaLabel={`Open ${COPILOT_BUSINESS_AGENTS_LINK.label}`}
										onIntentClick={() =>
											captureDownloadIntentClicked({
												intentType: 'copilot-business-resource',
												assetType: 'pptx',
												scenarioId: 'bs_cb',
												customerName,
												isDemo,
												isPublic,
											})
										}
									/>
								</div>
							</div>
						)}

						{scenarioAssets.map((scenario) => {
							const scenarioKeys = scenario.assets.map((a) =>
								assetKey(scenario.endingSkuId, a.fileName),
							);
							const selectedCount = scenarioKeys.filter((k) =>
								selectedResources.has(k),
							).length;
							const allSelected =
								scenarioKeys.length > 0 &&
								selectedCount === scenarioKeys.length;
							const isDownloading =
								downloadingScenario === scenario.endingSkuId;

							return (
								<div key={scenario.endingSkuId}>
									{/* Scenario header row */}
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => toggleScenario(scenario)}
											className="flex flex-1 items-center gap-2 text-left min-w-0"
										>
											{allSelected ? (
												<CheckmarkCircleFilled
													primaryFill="var(--ds-color-violet-500)"
													className="size-4 shrink-0"
												/>
											) : (
												<Circle12Filled
													primaryFill="currentColor"
													className="size-4 shrink-0 text-gray-300"
												/>
											)}
											<span className="text-sm font-semibold text-gray-700 truncate">
												{scenario.label}
											</span>
											{selectedCount > 0 && (
												<span className="text-xs text-gray-400 shrink-0">
													({selectedCount}/{scenario.assets.length})
												</span>
											)}
										</button>

										{/* Per-scenario download button */}
										<Button
											appearance="subtle"
											icon={
												isDownloading ? (
													<Spinner size="tiny" />
												) : (
													<ArrowDownloadRegular className="size-4" />
												)
											}
											disabled={selectedCount === 0 || isDownloading}
											onClick={() => handleDownloadScenario(scenario)}
											aria-label={`Download selected ${scenario.label} assets`}
											size="small"
										/>
									</div>

									{/* Asset list — flat with hover icon behavior */}
									<div className="mt-2 flex flex-col">
										{scenario.assets.map((asset) => (
											<GtmAssetListItem
												key={assetKey(scenario.endingSkuId, asset.fileName)}
												icon={getCategoryIcon(asset.category)}
												label={asset.label}
												selected={selectedResources.has(
													assetKey(scenario.endingSkuId, asset.fileName),
												)}
												onToggle={() =>
													toggleResource(
														assetKey(scenario.endingSkuId, asset.fileName),
													)
												}
											/>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}

			{scenarioAssets.length === 0 &&
				!hasCopilotBusiness &&
				endingSkuIds.length > 0 && (
					<>
						<hr className="my-4 border-t border-gray-200" />
						<p className="m-0 text-sm text-gray-400">
							No GTM assets available for the selected scenarios.
						</p>
					</>
				)}

			{/* ── Section: Explore resources to improve technical readiness ── */}
			{showTechReadiness && (
				<>
					<hr className="my-4 border-t border-gray-200" />
					<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
						{t('proposal.exploreTechnicalReadiness')}
					</h3>

					<div className="mt-3 flex flex-col">
						{hasCopilotSku &&
							TECH_READINESS_COPILOT.map((link) => (
								<AssetListItem
									key={link.label}
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={link.label}
									actionHref={link.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'technical-readiness',
											assetType: 'external-link',
											scenarioId: 'copilot',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>
							))}

						{hasPurviewSku &&
							TECH_READINESS_PURVIEW.map((link) => (
								<AssetListItem
									key={link.label}
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={link.label}
									actionHref={link.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'technical-readiness',
											assetType: 'external-link',
											scenarioId: 'purview',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>
							))}

						{hasDefenderSku &&
							TECH_READINESS_DEFENDER.map((link) => (
								<AssetListItem
									key={link.label}
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={link.label}
									actionHref={link.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'technical-readiness',
											assetType: 'external-link',
											scenarioId: 'defender',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>
							))}
					</div>
				</>
			)}

			{/* ── Section: Additional implementation and adoption resources ── */}
			{showAdoptionResources && (
				<>
					<hr className="my-4 border-t border-gray-200" />
					<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
						{t('proposal.additionalAdoptionResources')}
					</h3>

					<div className="mt-3 flex flex-col">
						{hasCopilotSku &&
							ADOPTION_COPILOT.map((link) => (
								<AssetListItem
									key={link.label}
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={link.label}
									actionHref={link.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'adoption-resource',
											assetType: 'external-link',
											scenarioId: 'copilot',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>
							))}

						{hasPurviewSku && (
							<>
								<AssetListItem
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={ADOPTION_PURVIEW_TOP.label}
									actionHref={ADOPTION_PURVIEW_TOP.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'adoption-resource',
											assetType: 'external-link',
											scenarioId: 'purview',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>

								{/* Interactive guides — expandable */}
								<div className="flex flex-col">
									<div
										role="button"
										tabIndex={0}
										onClick={() => setPurviewGuidesExpanded((v) => !v)}
										onKeyDown={(e) => {
											if (e.key === ' ' || e.key === 'Enter') {
												e.preventDefault();
												setPurviewGuidesExpanded((v) => !v);
											}
										}}
										className="flex cursor-pointer items-center gap-3 py-2 pr-2 hover:bg-gray-50 rounded-md"
										aria-expanded={purviewGuidesExpanded}
									>
										<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
											<BookOpenRegular className="size-4 text-indigo-600" />
										</span>
										<div className="min-w-0 flex-1">
											<p className="m-0 truncate text-sm pr-2 font-medium text-gray-800">
												Interactive guides
											</p>
										</div>
										{purviewGuidesExpanded ? (
											<ChevronDownRegular className="size-4 text-gray-500" />
										) : (
											<ChevronRightRegular className="size-4 text-gray-500" />
										)}
									</div>

									{purviewGuidesExpanded && (
										<div className="flex flex-col">
											{ADOPTION_PURVIEW_INTERACTIVE_GUIDES.map((link) => (
												<AssetListItem
													key={link.label}
													indent
													icon={
														<LinkRegular className="size-4 text-indigo-600" />
													}
													title={link.label}
													actionHref={link.url}
													actionIcon={<OpenRegular className="size-4" />}
													onIntentClick={() =>
														captureDownloadIntentClicked({
															intentType: 'adoption-resource',
															assetType: 'interactive-guide',
															scenarioId: 'purview',
															guideName: link.label,
															customerName,
															isDemo,
															isPublic,
														})
													}
												/>
											))}
										</div>
									)}
								</div>

								{ADOPTION_PURVIEW_BOTTOM.map((link) => (
									<AssetListItem
										key={link.label}
										icon={
											<BookOpenRegular className="size-4 text-indigo-600" />
										}
										title={link.label}
										actionHref={link.url}
										actionIcon={<OpenRegular className="size-4" />}
										onIntentClick={() =>
											captureDownloadIntentClicked({
												intentType: 'adoption-resource',
												assetType: 'external-link',
												scenarioId: 'purview',
												customerName,
												isDemo,
												isPublic,
											})
										}
									/>
								))}
							</>
						)}

						{hasDefenderSku &&
							ADOPTION_DEFENDER.map((link) => (
								<AssetListItem
									key={link.label}
									icon={
										<BookOpenRegular className="size-4 text-indigo-600" />
									}
									title={link.label}
									actionHref={link.url}
									actionIcon={<OpenRegular className="size-4" />}
									onIntentClick={() =>
										captureDownloadIntentClicked({
											intentType: 'adoption-resource',
											assetType: 'external-link',
											scenarioId: 'defender',
											customerName,
											isDemo,
											isPublic,
										})
									}
								/>
							))}
					</div>
				</>
			)}

			{/* ── Section 4: Execute Ready to Use Campaign ─────── */}
			{endingSkuIds.some((id) => id.includes('_cb')) && (
				<>
					<hr className="my-4 border-t border-gray-200" />
					<h3 className="m-0 text-sm font-semibold text-gray-600 uppercase tracking-wide">
						{t('proposal.executeReadyToUseCampaign')}
					</h3>
					<div className="mt-3 flex flex-col">
						<AssetListItem
							icon={<ChannelShare24Regular className="size-4 text-teal-500" />}
							title="Partner Marketing Center"
							actionHref="https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Faka.ms%2FCopilotBusinessSMB_PMC&data=05%7C02%7Cmtermulo%40microsoft.com%7Cacfb7d98ad634cc8baea08de9a68e6b0%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C639117972500347411%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=n%2Fq%2BHaoffOOGn%2BKXw%2BXGzkNrIpUgXwy7ctsJ1VL0V6s%3D&reserved=0"
							actionIcon={<OpenRegular className="size-4" />}
							ariaLabel="Open PMC campaign"
							border
						/>
						<AssetListItem
							icon={<ChannelShare24Regular className="size-4 text-teal-500" />}
							title="Partner Marketing Center Pro"
							actionHref="https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Faka.ms%2FCopilotBusinessSMB&data=05%7C02%7Cmtermulo%40microsoft.com%7Cacfb7d98ad634cc8baea08de9a68e6b0%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C639117972500362853%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=ugt64aFv4nBz6oBwaosn1YeYoCBPlVzXXsdiGj0osIo%3D&reserved=0"
							actionIcon={<OpenRegular className="size-4" />}
							ariaLabel="Open PMC Pro campaign"
						/>
					</div>
				</>
			)}

		</div>
	);
}
