'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error('ErrorBoundary caught:', error, info.componentStack);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 16,
						padding: 48,
						textAlign: 'center',
					}}
				>
					<div style={{ fontSize: 48 }}>⚠</div>
					<h3 style={{ margin: 0 }}>Something went wrong</h3>
					<p style={{ margin: 0, color: '#666' }}>
						{this.state.error?.message ?? 'An unexpected error occurred.'}
					</p>
					<button
						onClick={this.handleRetry}
						style={{
							padding: '8px 16px',
							borderRadius: 4,
							border: '1px solid #ccc',
							backgroundColor: '#fff',
							cursor: 'pointer',
							fontSize: 14,
						}}
					>
						Try Again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
