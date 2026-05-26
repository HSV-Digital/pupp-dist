import {
	Document,
	Link,
	Page,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer';
import type { ScenarioProposal } from '@/lib/proposal-types';
import { formatDate } from '@/lib/format-utils';

const styles = StyleSheet.create({
	page: {
		padding: 36,
		fontSize: 10,
		fontFamily: 'Helvetica',
		color: '#1a1a1a',
	},
	header: {
		marginBottom: 16,
		borderBottom: '2px solid #0078d4',
		paddingBottom: 10,
	},
	title: {
		fontSize: 18,
		fontFamily: 'Helvetica-Bold',
		color: '#0078d4',
	},
	subtitle: {
		fontSize: 11,
		color: '#555',
		marginTop: 4,
	},
	section: {
		marginBottom: 12,
	},
	sectionTitle: {
		fontSize: 11,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 6,
		color: '#333',
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: 12,
		paddingVertical: 2,
	},
	label: {
		color: '#666',
	},
	value: {
		fontFamily: 'Helvetica-Bold',
	},
	divider: {
		borderBottom: '1px solid #e0e0e0',
		marginVertical: 8,
	},
	summaryBox: {
		border: '1px solid #dfe7f5',
		borderRadius: 4,
		padding: 10,
		marginBottom: 10,
		backgroundColor: '#f8fbff',
	},
	resourceLink: {
		color: '#0078d4',
		marginBottom: 3,
	},
	footer: {
		position: 'absolute',
		bottom: 24,
		left: 36,
		right: 36,
		borderTop: '1px solid #e0e0e0',
		paddingTop: 6,
		fontSize: 8,
		color: '#999',
	},
});

const RESOURCE_LINKS = [
	{
		name: 'Proactive Proposal (PDF)',
		href: '/resources/proactive-proposal.pdf',
	},
	{ name: 'Email Template (HTML)', href: '/resources/email-template.html' },
	{ name: 'Pitch Deck (PPTX)', href: '/resources/pitch-deck.pptx' },
	{ name: 'Infographic (PDF)', href: '/resources/infographic.pdf' },
	{ name: 'E-book (PDF)', href: '/resources/ebook.pdf' },
	{ name: 'Sales Script (PDF)', href: '/resources/sales-script.pdf' },
];

function formatCurrencyPdf(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(value);
}

interface ProposalPDFDocumentProps {
	proposals: ScenarioProposal[];
	customerName: string;
	baseUrl: string;
	mode: 'single' | 'consolidated';
}

function ProposalPage({
	proposal,
	customerName,
	baseUrl,
}: {
	proposal: ScenarioProposal;
	customerName: string;
	baseUrl: string;
}) {
	const { subscription, scenario } = proposal;

	return (
		<Page size="A4" style={styles.page}>
			<View style={styles.header}>
				<Text style={styles.title}>Microsoft 365 Renewal Proposal</Text>
				<Text style={styles.subtitle}>
					Prepared for {customerName} — {scenario.endingSkuName}
				</Text>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Current Subscription</Text>
				<View style={styles.row}>
					<Text style={styles.label}>Subscription ID</Text>
					<Text style={styles.value}>{subscription.subscriptionId}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Current Product</Text>
					<Text style={styles.value}>{subscription.currentProduct}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Renewal Date</Text>
					<Text style={styles.value}>
						{formatDate(subscription.renewalDate)}
					</Text>
				</View>
			</View>

			<View style={styles.divider} />

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Upgrade Subscription</Text>
				<View style={styles.row}>
					<Text style={styles.label}>From</Text>
					<Text style={styles.value}>{scenario.startingSkuName}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>To</Text>
					<Text style={styles.value}>{scenario.endingSkuName}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Seats</Text>
					<Text style={styles.value}>{scenario.seats}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Target SKU cost to Customer (as per list price)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.listAnnualValue)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Cost savings from promos</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.promoSavingsAnnual)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Target SKU cost to Customer (promo price)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.offerAnnualValue)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Expiring SKU Renewal cost to Customer
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.currentAnnualValue)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Incremental Cost to Customer (Estimated)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.incrementalCost)}
					</Text>
				</View>
			</View>

			<View style={styles.divider} />

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Partner Profitability</Text>
				<View style={styles.row}>
					<Text style={styles.label}>CSP Core</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.economics.cspCore)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Strategic Accelerator</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.economics.strategicAccelerator)}
					</Text>
				</View>
				{scenario.startingSkuId !== 'other' && (
					<View style={styles.row}>
						<Text style={styles.label}>Growth Accelerator</Text>
						<Text style={styles.value}>
							{formatCurrencyPdf(scenario.economics.growthAccelerator)}
						</Text>
					</View>
				)}
				<View style={styles.row}>
					<Text style={styles.label}>Total Incentive</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.economics.totalIncentive)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Current Incentive</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.economics.currentIncentive)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Incremental Incentive</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(scenario.economics.incrementalIncentive)}
					</Text>
				</View>
			</View>

			<View style={styles.divider} />

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Resources</Text>
				{RESOURCE_LINKS.map((resource) => (
					<Link
						key={resource.name}
						src={baseUrl + resource.href}
						style={styles.resourceLink}
					>
						{resource.name}
					</Link>
				))}
			</View>

			<View style={styles.footer}>
				<Text>
					Generated on {new Date().toLocaleDateString()}. Pricing and incentives
					are subject to change.
				</Text>
			</View>
		</Page>
	);
}

function ConsolidatedSummaryPage({
	proposals,
	customerName,
}: {
	proposals: ScenarioProposal[];
	customerName: string;
}) {
	const totals = proposals.reduce(
		(acc, proposal) => {
			acc.currentAnnual += proposal.scenario.currentAnnualValue;
			acc.listAnnual += proposal.scenario.listAnnualValue;
			acc.offerAnnual += proposal.scenario.offerAnnualValue;
			acc.promoSavings += proposal.scenario.promoSavingsAnnual;
			acc.incrementalCost += proposal.scenario.incrementalCost;
			acc.incrementalIncentive +=
				proposal.scenario.economics.incrementalIncentive;
			return acc;
		},
		{
			currentAnnual: 0,
			listAnnual: 0,
			offerAnnual: 0,
			promoSavings: 0,
			incrementalCost: 0,
			incrementalIncentive: 0,
		},
	);

	return (
		<Page size="A4" style={styles.page}>
			<View style={styles.header}>
				<Text style={styles.title}>Consolidated Proposal Summary</Text>
				<Text style={styles.subtitle}>
					{customerName} — {proposals.length} selected scenario
					{proposals.length === 1 ? '' : 's'}
				</Text>
			</View>

			<View style={styles.summaryBox}>
				<View style={styles.row}>
					<Text style={styles.label}>
						Target SKU cost to Customer (as per list price total)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.listAnnual)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Cost savings from promos (Total)</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.promoSavings)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Target SKU cost to Customer (promo price total)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.offerAnnual)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Expiring SKU Renewal cost to Customer (Total)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.currentAnnual)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Incremental Cost to Customer (Estimated Total)
					</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.incrementalCost)}
					</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Incremental Incentive (Total)</Text>
					<Text style={styles.value}>
						{formatCurrencyPdf(totals.incrementalIncentive)}
					</Text>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Selected Subscriptions</Text>
				{proposals.map((proposal, index) => (
					<View key={proposal.opportunityId} style={styles.row}>
						<Text style={styles.label}>
							{index + 1}. {proposal.subscription.currentProduct}
						</Text>
						<Text style={styles.value}>{proposal.scenario.endingSkuName}</Text>
					</View>
				))}
			</View>

			<View style={styles.footer}>
				<Text>Summary generated on {new Date().toLocaleDateString()}.</Text>
			</View>
		</Page>
	);
}

export function ProposalPDFDocument({
	proposals,
	customerName,
	baseUrl,
	mode,
}: ProposalPDFDocumentProps) {
	return (
		<Document>
			{mode === 'consolidated' && proposals.length > 1 && (
				<ConsolidatedSummaryPage
					proposals={proposals}
					customerName={customerName}
				/>
			)}
			{proposals.map((proposal) => (
				<ProposalPage
					key={proposal.opportunityId}
					proposal={proposal}
					customerName={customerName}
					baseUrl={baseUrl}
				/>
			))}
		</Document>
	);
}
