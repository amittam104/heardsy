# Keep private feedback records separate from public posts

Store private feedback in dedicated records within the existing Heardsy application, database, and image storage, as selected in Q29. Public post operations require Heardsy reporter accounts and include public visibility, voting, integrations, and author/voter/commenter notifications; adapting every affected public path would couple the private inbox to those behaviors. Reuse suitable status definitions, validators, storage, and UI helpers while keeping private submission, reading, and workflow operations separate.
