import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetsLeftColumn } from './AssetsLeftColumn';

const createPartnerProposalEmailLinkMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
	cspPartnerPublicApiFetch: vi.fn(),
}));

vi.mock('@/lib/partner-proposal-email-link', () => ({
	createPartnerProposalEmailLink: (...args: unknown[]) =>
		createPartnerProposalEmailLinkMock(...args),
}));

const defaultProps = {
	customerName: 'Contoso',
	endingSkuIds: ['bs_cb'],
	showPartnerEmail: true,
	customerProposalEmailRequest: {
		journey: 'renewal' as const,
		customerId: 'cust-1',
		customerName: 'Contoso',
		scenarios: [
			{
				opportunityId: 'opp-1',
				startingSkuId: 'bs',
				startingSkuName: 'Business Standard',
				endingSkuId: 'bs_cb',
				selectedSeats: 35,
				originalSeats: 40,
				expiringArr: 6000,
			},
		],
	},
	proposalDownloadUrl: 'https://example.com/proposal-assets.zip?dlToken=abc',
};

describe('AssetsLeftColumn', () => {
	beforeEach(() => {
		createPartnerProposalEmailLinkMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders all three section headings', () => {
		render(<AssetsLeftColumn {...defaultProps} />);

		expect(
			screen.getByText('Customer ready proposal assets'),
		).toBeInTheDocument();
		expect(
			screen.getByText('Partner ready proposal assets'),
		).toBeInTheDocument();
		expect(screen.getByText('GTM Resources')).toBeInTheDocument();
	});

	it('renders section-aware skeleton when loading', () => {
		render(<AssetsLeftColumn {...defaultProps} loading />);

		expect(
			screen.getByTestId('assets-left-skeleton-customer'),
		).toBeInTheDocument();
		expect(
			screen.getByTestId('assets-left-skeleton-partner'),
		).toBeInTheDocument();
		expect(screen.getByTestId('assets-left-skeleton-gtm')).toBeInTheDocument();
		expect(
			screen.queryByRole('link', {
				name: /download/i,
			}),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', {
				name: /download/i,
			}),
		).not.toBeInTheDocument();
	});

	it('hides partner skeleton block when showPartnerEmail is false', () => {
		render(
			<AssetsLeftColumn {...defaultProps} loading showPartnerEmail={false} />,
		);

		expect(
			screen.getByTestId('assets-left-skeleton-customer'),
		).toBeInTheDocument();
		expect(
			screen.queryByTestId('assets-left-skeleton-partner'),
		).not.toBeInTheDocument();
	});

	it('renders PPT child item with correct download href', () => {
		render(<AssetsLeftColumn {...defaultProps} />);

		const pptLink = screen.getByRole('link', {
			name: /download consolidated proactive proposal document/i,
		});
		expect(pptLink).toHaveAttribute(
			'href',
			expect.stringContaining('&file=ppt'),
		);
	});

	it('hides consolidated PPT item when showConsolidatedPpt is false', () => {
		render(<AssetsLeftColumn {...defaultProps} showConsolidatedPpt={false} />);

		expect(
			screen.queryByRole('link', {
				name: /download consolidated proactive proposal document/i,
			}),
		).not.toBeInTheDocument();
	});

	it('renders DOCX child item with correct download href', () => {
		render(<AssetsLeftColumn {...defaultProps} />);

		const docxLink = screen.getByRole('link', {
			name: /download customer proposal e-mail/i,
		});
		expect(docxLink).toHaveAttribute(
			'href',
			expect.stringContaining('&file=email'),
		);
	});

	it('renders individual opportunity PPT items when provided', () => {
		const individualPpts = [
			{
				key: 'opp-1',
				label: 'Business Premium Proposal',
				downloadUrl: 'blob:https://example.com/ppt-1',
			},
			{
				key: 'opp-2',
				label: 'Business Standard Proposal',
				downloadUrl: 'blob:https://example.com/ppt-2',
			},
		];
		render(
			<AssetsLeftColumn {...defaultProps} individualPpts={individualPpts} />,
		);

		const ppt1Link = screen.getByRole('link', {
			name: /download business premium proposal/i,
		});
		expect(ppt1Link).toHaveAttribute('href', 'blob:https://example.com/ppt-1');

		const ppt2Link = screen.getByRole('link', {
			name: /download business standard proposal/i,
		});
		expect(ppt2Link).toHaveAttribute('href', 'blob:https://example.com/ppt-2');
	});

	it('renders customer proposal email after individual opportunity documents', () => {
		const individualPpts = [
			{
				key: 'opp-1',
				label: 'Business Premium Proposal',
				downloadUrl: 'blob:https://example.com/ppt-1',
			},
		];
		render(
			<AssetsLeftColumn {...defaultProps} individualPpts={individualPpts} />,
		);

		const emailLabel = screen.getByText('Customer Proposal E-mail');
		const proposalLabel = screen.getByText('Business Premium Proposal');
		const orderFlag = proposalLabel.compareDocumentPosition(emailLabel);
		expect(orderFlag & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
	});

	it('does not render individual PPT items when prop is omitted', () => {
		render(<AssetsLeftColumn {...defaultProps} />);

		expect(
			screen.queryByRole('link', {
				name: /download business premium proposal/i,
			}),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole('link', {
				name: /download business standard proposal/i,
			}),
		).not.toBeInTheDocument();
	});

	it('downloads partner-ready email using partner proposal endpoint', async () => {
		createPartnerProposalEmailLinkMock.mockResolvedValue({
			url: 'https://example.com/partner-proposal-email.docx',
			expiresAt: '2026-02-23T00:00:00.000Z',
		});

		const pendingTab = {
			closed: false,
			opener: null as null,
			location: { href: '' },
		};
		const openSpy = vi
			.spyOn(window, 'open')
			.mockReturnValue(pendingTab as unknown as Window);

		render(<AssetsLeftColumn {...defaultProps} />);

		fireEvent.click(screen.getByRole('button', { name: /download partner/i }));

		await waitFor(() =>
			expect(createPartnerProposalEmailLinkMock).toHaveBeenCalledWith({
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bs_cb',
						selectedSeats: 35,
						originalSeats: 40,
						expiringArr: 6000,
					},
				],
			}),
		);
		expect(openSpy).toHaveBeenCalledWith('', '_blank');
		expect(pendingTab.location.href).toBe(
			'https://example.com/partner-proposal-email.docx',
		);
	});
});
