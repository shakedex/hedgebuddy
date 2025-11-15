<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'danger' | 'back' | 'icon' = 'primary';
  export let disabled = false;
  export let title = '';
</script>

<button 
  class="btn btn-{variant}" 
  {disabled} 
  {title}
  on:click
>
  <slot />
</button>
