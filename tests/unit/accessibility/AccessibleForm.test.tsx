/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AccessibleTextInput,
  AccessibleTextArea,
  AccessibleSelect,
  AccessibleCheckbox,
  AccessibleRadioGroup,
  AccessibleAlert,
  SkipLink,
  LiveRegion,
} from '@/components/ui/AccessibleForm';

describe('AccessibleTextInput', () => {
  it('renders with label and proper ARIA attributes', () => {
    render(<AccessibleTextInput label="Email" required />);
    
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('shows error state with proper ARIA', () => {
    render(
      <AccessibleTextInput
        label="Email"
        error="Invalid email address"
      />
    );
    
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Invalid email address');
  });

  it('associates helper text with input', () => {
    render(
      <AccessibleTextInput
        label="Password"
        helperText="Must be at least 8 characters"
      />
    );
    
    const input = screen.getByLabelText(/password/i);
    expect(input).toHaveAttribute('aria-describedby');
    
    const helperText = screen.getByText('Must be at least 8 characters');
    expect(helperText).toBeInTheDocument();
  });

  it('meets minimum touch target size', () => {
    render(<AccessibleTextInput label="Name" />);
    
    const input = screen.getByLabelText(/name/i);
    expect(input).toHaveClass('min-h-[44px]');
  });
});

describe('AccessibleTextArea', () => {
  it('renders with correct rows and ARIA attributes', () => {
    render(<AccessibleTextArea label="Description" rows={6} required />);
    
    const textarea = screen.getByLabelText(/description/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('rows', '6');
    expect(textarea).toHaveAttribute('aria-required', 'true');
  });

  it('displays error with role alert', () => {
    render(
      <AccessibleTextArea
        label="Notes"
        error="Notes are required"
      />
    );
    
    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Notes are required');
  });
});

describe('AccessibleSelect', () => {
  const options = [
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
    { value: 'mx', label: 'Mexico' },
  ];

  it('renders options correctly', () => {
    render(
      <AccessibleSelect
        label="Country"
        options={options}
        placeholder="Select a country"
      />
    );
    
    const select = screen.getByLabelText(/country/i);
    expect(select).toBeInTheDocument();
    
    // Check placeholder
    expect(screen.getByText('Select a country')).toBeInTheDocument();
    
    // Check options
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('Canada')).toBeInTheDocument();
    expect(screen.getByText('Mexico')).toBeInTheDocument();
  });

  it('supports disabled options', () => {
    const optionsWithDisabled = [
      ...options,
      { value: 'disabled', label: 'Disabled Option', disabled: true },
    ];
    
    render(
      <AccessibleSelect
        label="Country"
        options={optionsWithDisabled}
      />
    );
    
    const disabledOption = screen.getByText('Disabled Option');
    expect(disabledOption).toBeDisabled();
  });
});

describe('AccessibleCheckbox', () => {
  it('renders with label and description', () => {
    render(
      <AccessibleCheckbox
        label="Subscribe to newsletter"
        description="Receive weekly updates"
      />
    );
    
    const checkbox = screen.getByLabelText(/subscribe to newsletter/i);
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute('type', 'checkbox');
    
    expect(screen.getByText('Receive weekly updates')).toBeInTheDocument();
  });

  it('can be checked and unchecked', () => {
    render(<AccessibleCheckbox label="Accept terms" />);
    
    const checkbox = screen.getByLabelText(/accept terms/i);
    expect(checkbox).not.toBeChecked();
    
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});

describe('AccessibleRadioGroup', () => {
  const options = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ];

  it('renders all options with radiogroup role', () => {
    render(
      <AccessibleRadioGroup
        name="size"
        label="Select size"
        options={options}
      />
    );
    
    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup).toBeInTheDocument();
    
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('shows required indicator', () => {
    render(
      <AccessibleRadioGroup
        name="size"
        label="Select size"
        options={options}
        required
      />
    );
    
    const legend = screen.getByText(/select size/i);
    expect(legend).toBeInTheDocument();
    
    // Check for required asterisk
    const asterisk = screen.getByText('*');
    expect(asterisk).toBeInTheDocument();
  });

  it('calls onChange when option is selected', () => {
    const handleChange = vi.fn();
    
    render(
      <AccessibleRadioGroup
        name="size"
        label="Select size"
        options={options}
        onChange={handleChange}
      />
    );
    
    const mediumOption = screen.getByLabelText('Medium');
    fireEvent.click(mediumOption);
    
    expect(handleChange).toHaveBeenCalledWith('medium');
  });

  it('renders horizontal orientation', () => {
    render(
      <AccessibleRadioGroup
        name="size"
        label="Select size"
        options={options}
        orientation="horizontal"
      />
    );
    
    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup).toHaveClass('flex');
  });
});

describe('AccessibleAlert', () => {
  it('renders success alert with role status', () => {
    render(
      <AccessibleAlert type="success" title="Success">
        Your changes have been saved
      </AccessibleAlert>
    );
    
    const alert = screen.getByRole('status');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Your changes have been saved')).toBeInTheDocument();
  });

  it('renders error alert with role alert', () => {
    render(
      <AccessibleAlert type="error">
        Something went wrong
      </AccessibleAlert>
    );
    
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('can be dismissed', () => {
    const handleDismiss = vi.fn();
    
    render(
      <AccessibleAlert type="info" dismissible onDismiss={handleDismiss}>
        Dismissible alert
      </AccessibleAlert>
    );
    
    const dismissButton = screen.getByLabelText('Dismiss');
    expect(dismissButton).toBeInTheDocument();
    
    fireEvent.click(dismissButton);
    expect(handleDismiss).toHaveBeenCalled();
    
    // Alert should be removed from DOM
    expect(screen.queryByText('Dismissible alert')).not.toBeInTheDocument();
  });
});

describe('SkipLink', () => {
  it('renders with correct href and text', () => {
    render(<SkipLink href="#main" />);
    
    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main');
  });

  it('is visually hidden by default', () => {
    render(<SkipLink />);
    
    const link = screen.getByText('Skip to main content');
    expect(link).toHaveClass('sr-only');
  });
});

describe('LiveRegion', () => {
  it('renders with correct ARIA attributes', () => {
    render(<LiveRegion message="Loading complete" politeness="polite" />);
    
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveTextContent('Loading complete');
  });

  it('supports assertive politeness', () => {
    render(<LiveRegion message="Error occurred" politeness="assertive" />);
    
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'assertive');
  });
});

describe('WCAG 2.1 AA Compliance', () => {
  describe('Focus Management', () => {
    it('inputs have visible focus states', () => {
      render(<AccessibleTextInput label="Test" />);
      
      const input = screen.getByLabelText(/test/i);
      expect(input).toHaveClass('focus:ring-2');
    });
  });

  describe('Color Contrast', () => {
    it('error messages use high contrast colors', () => {
      render(<AccessibleTextInput label="Email" error="Invalid" />);
      
      const error = screen.getByRole('alert');
      expect(error).toHaveClass('text-red-600');
    });
  });

  describe('Touch Target Size (WCAG 2.5.5)', () => {
    it('all interactive elements meet 44x44px minimum', () => {
      render(<AccessibleTextInput label="Test" />);
      const input = screen.getByLabelText(/test/i);
      expect(input).toHaveClass('min-h-[44px]');
      
      render(<AccessibleSelect label="Select" options={[]} />);
      const select = screen.getAllByRole('combobox')[0];
      expect(select).toHaveClass('min-h-[44px]');
    });
  });

  describe('Error Identification (WCAG 3.3.1)', () => {
    it('errors are announced to screen readers', () => {
      render(<AccessibleTextInput label="Email" error="Invalid email" />);
      
      const error = screen.getByRole('alert');
      expect(error).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Labels and Instructions (WCAG 3.3.2)', () => {
    it('required fields are clearly marked', () => {
      render(<AccessibleTextInput label="Email" required />);
      
      // Visual indicator
      expect(screen.getByText('*')).toBeInTheDocument();
      
      // Screen reader text
      expect(screen.getByText('(required)')).toHaveClass('sr-only');
    });
  });
});
