import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/app/_layout';
import { CostMeter, costMeterLabel } from '@/components/CostMeter';
import { ClearanceGauge } from '@/components/ClearanceGauge';
import { Banner, Pills, Stepper } from '@/components/ui';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

describe('CostMeter', () => {
  it('labels every level for screen readers', () => {
    expect(costMeterLabel(null)).toBe('Fee not reported');
    expect(costMeterLabel(0)).toBe('Free, $0 a night');
    expect(costMeterLabel(3)).toBe('High, Over $30 a night');
  });

  it('shows the caption in the large size', () => {
    render(<CostMeter level={2} />);
    expect(screen.getByText('Moderate, $15–30 a night')).toBeTruthy();
  });

  it('leaves the caption out of the small size', () => {
    render(<CostMeter level={2} size="sm" />);
    expect(screen.queryByText('Moderate, $15–30 a night')).toBeNull();
    expect(screen.getByLabelText('Cost meter: Moderate, $15–30 a night')).toBeTruthy();
  });
});

describe('ClearanceGauge', () => {
  it('describes the tier', () => {
    render(<ClearanceGauge tier={4} />);
    expect(screen.getByLabelText('Clearance tier C4 of 7')).toBeTruthy();
    render(<ClearanceGauge tier={null} />);
    expect(screen.getByLabelText('Clearance not reported')).toBeTruthy();
  });
});

describe('Stepper', () => {
  it('clamps to its range and disables the end buttons', () => {
    const onChange = jest.fn();
    render(
      <Stepper label="Size" value={10} min={2} max={10} step={1} unit="in" unitSpoken="inches" onChange={onChange} />,
    );
    fireEvent.press(screen.getByLabelText('Increase Size'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Decrease Size'));
    expect(onChange).toHaveBeenCalledWith(9);
  });
});

describe('Pills', () => {
  it('uses radio buttons for one choice and checkboxes for toggles', () => {
    const onPress = jest.fn();
    render(
      <Pills
        mode="single"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        isSelected={(v) => v === 'a'}
        onPress={onPress}
        accessibilityLabel="Letters"
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByRole('radio', { name: 'B' }));
    expect(onPress).toHaveBeenCalledWith('b');

    render(
      <Pills
        mode="multiple"
        options={[{ value: 'x', label: 'X' }]}
        isSelected={() => false}
        onPress={onPress}
        accessibilityLabel="Toggles"
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'X' })).toBeTruthy();
  });
});

describe('Banner', () => {
  it('shows an action and announces errors', () => {
    const onAction = jest.fn();
    render(<Banner tone="error" message="Broken" actionLabel="Retry" onAction={onAction} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('ErrorBoundary', () => {
  it('offers a retry after a crash', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const retry = jest.fn(() => Promise.resolve());
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ErrorBoundary error={new Error('boom')} retry={retry} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalled();
  });
});
