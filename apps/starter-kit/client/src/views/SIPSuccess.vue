<template>
  <div class="text-section">
    <h1 class="text-section-title" style="text-align: center;">
      Thank you
    </h1>
    <div class="tick-container">
      <img class="tick" src="../assets/icons/tick.svg" alt="tick" />
    </div>
    <p style="text-align: center;">
      We have received the premission to make payments from your selected account(s)
    </p>
  </div>
  <div>
    <button @click="submit" class="secondaryButton">
      <span class="seondary-button-text">Proceed to Payment Dashboard</span>
    </button>
  </div>
</template>

<script>
export default {
  methods: {
    submit() {
      this.$router.push({name: 'sip-request', query: this.$route.query})
    }
  }
}
</script>