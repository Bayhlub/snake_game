<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreScoreRequest extends FormRequest
{
    /**
     * Anyone playing the game may submit a score.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'player_name' => ['required', 'string', 'max:20'],
            'points' => ['required', 'integer', 'min:0', 'max:100000'],
            'length' => ['required', 'integer', 'min:1', 'max:5000'],
        ];
    }

    /**
     * Trim the player name before validating.
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('player_name'))) {
            $this->merge(['player_name' => trim($this->input('player_name'))]);
        }
    }
}
