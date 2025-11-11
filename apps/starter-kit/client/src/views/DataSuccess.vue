<template>
  <div class="text-section">
    <h1 class="text-section-title" style="text-align: center;">
      Thank you
    </h1>
    <div class="tick-container">
      <img class="tick" src="../assets/icons/tick.svg" alt="tick" />
    </div>
    <p style="text-align: center;">
      We have received the requested information from your selected account(s)
    </p>

  </div>
  <div>
    <button @click="submit" class="secondaryButton">
      <span class="seondary-button-text">Proceed to Request Dashboard</span>
    </button>
    <p>
     We will access your information from your account(s) until 25/12/2025
    </p>
  </div>
</template>

<script>
export default {
  methods: {
    submit() {
      this.$router.push({name: 'data-requests', query: this.$route.query})
    },
  }
}
</script>