import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionCard } from './QuestionCard'

const question = {
  id: 'q1', question_text: 'She ___ to school.', question_order: 1,
  options: [
    { id: 'a', option_label: 'A', option_text: 'go', option_order: 0 },
    { id: 'b', option_label: 'B', option_text: 'goes', option_order: 1 },
  ],
}
const base = { question, index: 2, total: 20, selectedId: null, result: null, submitting: false, onSelect: () => {}, onSubmit: () => {} }

describe('QuestionCard', () => {
  it('shows progress and keeps "Check answer" disabled until a choice is picked', () => {
    render(<QuestionCard {...base} />)
    expect(screen.getByText('Question 3 of 20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled()
  })
  it('reports the selected option and submits', async () => {
    const onSelect = vi.fn(); const onSubmit = vi.fn()
    const { rerender } = render(<QuestionCard {...base} onSelect={onSelect} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('radio', { name: /goes/ }))
    expect(onSelect).toHaveBeenCalledWith('b')
    rerender(<QuestionCard {...base} selectedId="b" onSelect={onSelect} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalled()
  })
  it('shows correct feedback with text, explanation, and locks the choices', () => {
    render(<QuestionCard {...base} selectedId="b" result={{ is_correct: true, selected_option_id: 'b', correct_option_id: 'b', explanation: 'Third person singular.', already_answered: false }} />)
    expect(screen.getByText('Correct!')).toBeInTheDocument()
    expect(screen.getByText('Third person singular.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /goes/ })).toBeDisabled()
  })
  it('marks a wrong pick and reveals the right answer using text, not only colour', () => {
    render(<QuestionCard {...base} selectedId="a" result={{ is_correct: false, selected_option_id: 'a', correct_option_id: 'b', explanation: null, already_answered: false }} />)
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByText('Your answer')).toBeInTheDocument()
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
  })
})
