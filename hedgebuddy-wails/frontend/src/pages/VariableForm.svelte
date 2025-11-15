<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';
  import Button from '../components/Button.svelte';
  import FormGroup from '../components/FormGroup.svelte';
  import RadioGroup from '../components/RadioGroup.svelte';
  
  export let name = '';
  export let value = '';
  export let type = 'string';
  export let description = '';
  export let errorMsg = '';
  export let isEditing = false;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  const typeOptions = [
    { value: 'string', label: 'String' },
    { value: 'path', label: 'Path' },
    { value: 'url', label: 'URL' },
    { value: 'secure', label: 'Secure' }
  ];
  
  const typeDescriptions: Record<string, string> = {
    string: 'General text value (default)',
    path: 'File or directory path (validated)',
    url: 'Web URL (validated format)',
    secure: 'Sensitive data like API keys'
  };
</script>

<div class="header">
  <Button variant="back" on:click={() => dispatch('cancel')}>
    <ArrowLeft size={20} />
    Back
  </Button>
  <h1>{isEditing ? 'Edit Variable' : 'Add New Variable'}</h1>
</div>

{#if errorMsg}
  <div class="error-message">⚠ {errorMsg}</div>
{/if}

<div class="form-container">
  <!-- Row 1: Name & Type -->
  <div class="form-row">
    <FormGroup label="VARIABLE NAME">
      <input type="text" bind:value={name} placeholder="e.g., API_KEY" />
    </FormGroup>
    
    <FormGroup label="VARIABLE TYPE" hint={typeDescriptions[type]}>
      <RadioGroup options={typeOptions} bind:value={type} name="varType" />
    </FormGroup>
  </div>
  
  <!-- Row 2: Value -->
  <div class="form-row">
    <FormGroup label="VALUE">
      <input type="text" bind:value={value} placeholder="Enter the variable value..." />
    </FormGroup>
  </div>
  
  <!-- Row 3: Description -->
  <div class="form-row">
    <FormGroup label="DESCRIPTION (OPTIONAL)">
      <input type="text" bind:value={description} placeholder="Brief description of what this variable is used for..." />
    </FormGroup>
  </div>
  
  <Button variant="primary" on:click={() => dispatch('save', { name, value, type, description })}>
    Save Variable
  </Button>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-2xl);
  }
  
  h1 {
    font-size: var(--text-3xl);
    color: var(--text-primary);
    margin: 0;
    flex: 1;
    text-align: center;
    margin-right: 80px; /* Offset for back button width to center title */
  }
  
  .error-message {
    margin-bottom: var(--spacing-lg);
  }
  
  .form-container {
    max-width: 900px;
    margin: 0 auto;
  }
  
  .form-row {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }
  
  .form-row :global(.form-group) {
    flex: 1;
  }
  
  .form-row:nth-child(2),
  .form-row:nth-child(3) {
    flex-direction: column;
  }
  
  .form-row:nth-child(2) :global(.form-group),
  .form-row:nth-child(3) :global(.form-group) {
    width: 100%;
  }
  
  .form-container :global(.btn-primary) {
    width: 100%;
    padding: 14px 32px;
    font-size: var(--text-lg);
    margin-top: var(--spacing-sm);
    border-radius: var(--radius-md);
  }
</style>
